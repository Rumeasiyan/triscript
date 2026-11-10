package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Rumeasiyan/triscript/backend/internal/ocr"
	"github.com/Rumeasiyan/triscript/backend/internal/session"
	"github.com/Rumeasiyan/triscript/backend/internal/storage"
)

//go:embed web/*
var phonePages embed.FS

const (
	maxUpload       = 12 << 20
	maxPages        = 20
	maxJSONBody     = 1 << 20
	sessionRate     = 10
	sessionRateSpan = time.Minute
)

type letterStore interface {
	Save(context.Context, bool, string, map[string]ocr.Field) (storage.Letter, error)
	List(context.Context, int) ([]storage.Letter, error)
	SavePageFiles(context.Context, int64, []storage.SavePageFileParams) ([]storage.LetterFile, error)
	ListPageFiles(context.Context, int64) ([]storage.LetterFile, error)
	GetPageFilePath(context.Context, int64, int) (string, string, error)
	DeletePageFiles(context.Context, int64) ([]string, error)
}

type apiConfig struct {
	store     *session.Store
	letters   letterStore
	publicURL string
	webOrigin string
	filesDir  string // directory where opt-in page images are permanently stored
}

type rateLimiter struct {
	mu       sync.Mutex
	requests map[string][]time.Time
	calls    uint64
}

func (l *rateLimiter) allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.requests == nil {
		l.requests = make(map[string][]time.Time)
	}
	if l.calls%128 == 0 {
		for address, timestamps := range l.requests {
			if len(timestamps) == 0 || now.Sub(timestamps[len(timestamps)-1]) >= sessionRateSpan {
				delete(l.requests, address)
			}
		}
	}
	l.calls++
	cutoff := now.Add(-sessionRateSpan)
	recent := l.requests[key][:0]
	for _, timestamp := range l.requests[key] {
		if timestamp.After(cutoff) {
			recent = append(recent, timestamp)
		}
	}
	if len(recent) >= sessionRate {
		l.requests[key] = recent
		return false
	}
	l.requests[key] = append(recent, now)
	return true
}

func newAPIHandler(config apiConfig) http.Handler {
	mux := http.NewServeMux()
	limiter := &rateLimiter{}

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("POST /api/sessions", func(w http.ResponseWriter, r *http.Request) {
		if !limiter.allow(clientAddress(r), time.Now()) {
			http.Error(w, "session creation rate limit exceeded", http.StatusTooManyRequests)
			return
		}
		s := config.store.New()
		writeJSON(w, http.StatusCreated, map[string]any{
			"id":        s.ID,
			"expiresAt": s.Expires,
			"pairUrl":   fmt.Sprintf("%s/m/%s?t=%s", strings.TrimRight(config.publicURL, "/"), s.ID, s.Token),
		})
	})

	mux.HandleFunc("GET /api/sessions/{id}/events", func(w http.ResponseWriter, r *http.Request) {
		s := config.store.Get(r.PathValue("id"), "")
		if s == nil {
			http.Error(w, "session expired", http.StatusGone)
			return
		}
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming is unavailable", http.StatusInternalServerError)
			return
		}
		ch, unsubscribe := s.Subscribe()
		defer unsubscribe()
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		flusher.Flush()
		for {
			select {
			case event := <-ch:
				encoded, err := json.Marshal(event)
				if err != nil {
					log.Printf("encode session event: %v", err)
					return
				}
				if _, err := fmt.Fprintf(w, "data: %s\n\n", encoded); err != nil {
					return
				}
				flusher.Flush()
				if event.Type == "expired" || event.Type == "result" {
					return
				}
			case <-r.Context().Done():
				return
			}
		}
	})

	mux.HandleFunc("POST /api/sessions/{id}/photo", func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("t")
		if token == "" {
			http.Error(w, "upload token required", http.StatusUnauthorized)
			return
		}
		s := config.store.Get(r.PathValue("id"), token)
		if s == nil {
			http.Error(w, "session expired or upload token invalid", http.StatusGone)
			return
		}
		if !s.BeginPage() {
			http.Error(w, "session is processing a page or already complete", http.StatusConflict)
			return
		}
		pageAdded := false
		defer func() {
			if !pageAdded {
				s.FailPage()
			}
		}()

		r.Body = http.MaxBytesReader(w, r.Body, maxUpload)
		if err := r.ParseMultipartForm(maxUpload); err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				http.Error(w, "photo exceeds the upload limit", http.StatusRequestEntityTooLarge)
				return
			}
			http.Error(w, "invalid photo upload", http.StatusBadRequest)
			return
		}
		if r.MultipartForm != nil {
			defer func() {
				if err := r.MultipartForm.RemoveAll(); err != nil {
					log.Printf("remove multipart upload temporary files: %v", err)
				}
			}()
		}
		file, header, err := r.FormFile("photo")
		if err != nil {
			http.Error(w, "photo field is required", http.StatusBadRequest)
			return
		}
		defer file.Close()
		if header.Size > maxUpload {
			http.Error(w, "photo exceeds the upload limit", http.StatusRequestEntityTooLarge)
			return
		}
		if s.PageCount() >= maxPages {
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "page_limit"})
			return
		}

		complete := true
		if raw := r.FormValue("complete"); raw != "" {
			complete, err = strconv.ParseBool(raw)
			if err != nil {
				http.Error(w, "complete must be true or false", http.StatusBadRequest)
				return
			}
		}
		directory, err := os.MkdirTemp("", "triscript-*")
		if err != nil {
			http.Error(w, "could not create a temporary upload directory", http.StatusInternalServerError)
			return
		}
		// keepDir tracks whether the session has taken ownership of the directory.
		keepDir := false
		defer func() {
			if !keepDir {
				if err := os.RemoveAll(directory); err != nil {
					log.Printf("remove OCR temporary directory %q: %v", directory, err)
				}
			}
		}()
		input, err := os.CreateTemp(directory, "photo-*")
		if err != nil {
			http.Error(w, "could not create a temporary upload file", http.StatusInternalServerError)
			return
		}
		inputPath := input.Name()
		written, copyErr := io.Copy(input, io.LimitReader(file, maxUpload+1))
		closeErr := input.Close()
		if copyErr != nil {
			http.Error(w, "could not read uploaded photo", http.StatusBadRequest)
			return
		}
		if closeErr != nil {
			http.Error(w, "could not write uploaded photo", http.StatusInternalServerError)
			return
		}
		if written == 0 || written > maxUpload {
			http.Error(w, "photo is empty or exceeds the upload limit", http.StatusRequestEntityTooLarge)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Minute)
		defer cancel()
		s.Publish(session.Event{Type: "captured"})
		s.Publish(session.Event{Type: "processing"})
		if err := ocr.CheckQuality(ctx, inputPath); err != nil {
			var qualityError ocr.QualityError
			if errors.As(err, &qualityError) {
				publishUploadError(s, string(qualityError))
				writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": string(qualityError)})
				return
			}
			log.Printf("check uploaded photo quality: %v", err)
			publishUploadError(s, "image_check_failed")
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "image_check_failed"})
			return
		}
		processedPath := filepath.Join(directory, "processed.png")
		if err := ocr.Preprocess(ctx, inputPath, processedPath); err != nil {
			log.Printf("preprocess uploaded photo: %v", err)
			publishUploadError(s, "image_unreadable")
			writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "image_unreadable"})
			return
		}
		lines, _, err := ocr.ReadBest(ctx, processedPath)
		if err != nil {
			log.Printf("read uploaded photo: %v", err)
			publishUploadError(s, "ocr_failed")
			writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "ocr_failed"})
			return
		}
		if len(lines) == 0 {
			publishUploadError(s, "no_text")
			writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "no_text"})
			return
		}
		pages, pageCount, added := s.AddPage(lines, complete)
		if !added {
			http.Error(w, "session expired while processing the photo", http.StatusGone)
			return
		}
		pageAdded = true

		// Keep the processed image in the session so the confirm handler can
		// move it to permanent storage if the user opts in. Session takes ownership.
		if config.filesDir != "" {
			s.AddPageImage(session.PageImage{Dir: directory, Path: processedPath})
			keepDir = true
		}

		if complete {
			result := ocr.ExtractPages(pages)
			s.Publish(session.Event{Type: "result", Data: result})
			writeJSON(w, http.StatusOK, map[string]any{"page": pageCount, "complete": true})
			return
		}
		s.Publish(session.Event{Type: "page-ready", Data: map[string]int{"pages": pageCount}})
		writeJSON(w, http.StatusOK, map[string]any{"page": pageCount, "complete": false})
	})

	mux.HandleFunc("POST /api/letters", func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Confirmed  *bool           `json:"confirmed"`
			FormType   string          `json:"formType"`
			Fields     json.RawMessage `json:"fields"`
			SessionID  string          `json:"sessionId"`
			KeepImages *bool           `json:"keepImages"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxJSONBody)
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&payload); err != nil {
			http.Error(w, "invalid letter request", http.StatusBadRequest)
			return
		}
		if err := decoder.Decode(&struct{}{}); err != io.EOF {
			http.Error(w, "request must contain one JSON object", http.StatusBadRequest)
			return
		}
		if payload.Confirmed == nil || !*payload.Confirmed {
			http.Error(w, "explicit confirmation is required; nothing was saved", http.StatusBadRequest)
			return
		}
		fields, err := decodeFields(payload.Fields)
		if err != nil {
			http.Error(w, "letter fields are invalid", http.StatusBadRequest)
			return
		}
		if !validFormType(payload.FormType) {
			http.Error(w, "formType is invalid", http.StatusBadRequest)
			return
		}
		if config.letters == nil {
			http.Error(w, "letter database is not configured; nothing was saved", http.StatusServiceUnavailable)
			return
		}

		// Resolve the session to optionally take its page images.
		var sess *session.Session
		if payload.SessionID != "" {
			sess = config.store.Get(payload.SessionID, "")
		}

		letter, err := config.letters.Save(r.Context(), true, payload.FormType, fields)
		if err != nil {
			log.Printf("save confirmed letter: %v", err)
			if sess != nil {
				sess.DeletePageImages()
			}
			http.Error(w, "could not save confirmed letter", http.StatusInternalServerError)
			return
		}

		keepImages := payload.KeepImages != nil && *payload.KeepImages
		if keepImages && sess != nil && config.filesDir != "" {
			imgs := sess.TakePageImages()
			if len(imgs) > 0 {
				if saveErr := savePageImages(r.Context(), config, letter.ID, imgs); saveErr != nil {
					log.Printf("save page images for letter %d: %v", letter.ID, saveErr)
					// Non-fatal: letter already saved; images cleaned up inside savePageImages.
				}
			}
		} else if sess != nil {
			sess.DeletePageImages()
		}

		writeJSON(w, http.StatusCreated, letter)
	})

	mux.HandleFunc("GET /api/letters", func(w http.ResponseWriter, r *http.Request) {
		if config.letters == nil {
			http.Error(w, "letter database is not configured", http.StatusServiceUnavailable)
			return
		}
		limit := 100
		if raw := r.URL.Query().Get("limit"); raw != "" {
			parsed, err := strconv.Atoi(raw)
			if err != nil || parsed < 1 || parsed > 100 {
				http.Error(w, "limit must be between 1 and 100", http.StatusBadRequest)
				return
			}
			limit = parsed
		}
		letters, err := config.letters.List(r.Context(), limit)
		if err != nil {
			log.Printf("list confirmed letters: %v", err)
			http.Error(w, "could not list confirmed letters", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, letters)
	})

	// GET /api/letters/{id}/pages — list page image metadata.
	mux.HandleFunc("GET /api/letters/{id}/pages", func(w http.ResponseWriter, r *http.Request) {
		if config.letters == nil {
			http.Error(w, "letter database is not configured", http.StatusServiceUnavailable)
			return
		}
		letterID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil || letterID < 1 {
			http.Error(w, "invalid letter id", http.StatusBadRequest)
			return
		}
		files, err := config.letters.ListPageFiles(r.Context(), letterID)
		if err != nil {
			log.Printf("list page files for letter %d: %v", letterID, err)
			http.Error(w, "could not list page files", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, files)
	})

	// GET /api/letters/{id}/pages/{page} — serve the full-size page image.
	mux.HandleFunc("GET /api/letters/{id}/pages/{page}", func(w http.ResponseWriter, r *http.Request) {
		if config.letters == nil || config.filesDir == "" {
			http.Error(w, "page image storage is not configured", http.StatusServiceUnavailable)
			return
		}
		letterID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil || letterID < 1 {
			http.Error(w, "invalid letter id", http.StatusBadRequest)
			return
		}
		pageNo, err := strconv.Atoi(r.PathValue("page"))
		if err != nil || pageNo < 1 {
			http.Error(w, "invalid page number", http.StatusBadRequest)
			return
		}
		path, mime, err := config.letters.GetPageFilePath(r.Context(), letterID, pageNo)
		if err != nil {
			log.Printf("get page file path: %v", err)
			http.Error(w, "could not look up page image", http.StatusInternalServerError)
			return
		}
		if path == "" || !isInsideDir(config.filesDir, path) {
			http.Error(w, "page image not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", mime)
		w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
		http.ServeFile(w, r, path)
	})

	// GET /api/letters/{id}/pages/{page}/thumbnail — serve a small thumbnail.
	mux.HandleFunc("GET /api/letters/{id}/pages/{page}/thumbnail", func(w http.ResponseWriter, r *http.Request) {
		if config.letters == nil || config.filesDir == "" {
			http.Error(w, "page image storage is not configured", http.StatusServiceUnavailable)
			return
		}
		letterID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil || letterID < 1 {
			http.Error(w, "invalid letter id", http.StatusBadRequest)
			return
		}
		pageNo, err := strconv.Atoi(r.PathValue("page"))
		if err != nil || pageNo < 1 {
			http.Error(w, "invalid page number", http.StatusBadRequest)
			return
		}
		path, _, err := config.letters.GetPageFilePath(r.Context(), letterID, pageNo)
		if err != nil {
			log.Printf("get page file path for thumbnail: %v", err)
			http.Error(w, "could not look up page image", http.StatusInternalServerError)
			return
		}
		if path == "" || !isInsideDir(config.filesDir, path) {
			http.Error(w, "page image not found", http.StatusNotFound)
			return
		}
		thumbPath := path + ".thumb.jpg"
		if _, statErr := os.Stat(thumbPath); os.IsNotExist(statErr) {
			ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
			defer cancel()
			if err := ocr.CreateThumbnail(ctx, path, thumbPath); err != nil {
				log.Printf("create thumbnail for %q: %v", path, err)
				http.Error(w, "could not create thumbnail", http.StatusInternalServerError)
				return
			}
		}
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
		http.ServeFile(w, r, thumbPath)
	})

	// DELETE /api/letters/{id}/pages — delete all stored page images for a letter.
	mux.HandleFunc("DELETE /api/letters/{id}/pages", func(w http.ResponseWriter, r *http.Request) {
		if config.letters == nil || config.filesDir == "" {
			http.Error(w, "page image storage is not configured", http.StatusServiceUnavailable)
			return
		}
		letterID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil || letterID < 1 {
			http.Error(w, "invalid letter id", http.StatusBadRequest)
			return
		}
		paths, err := config.letters.DeletePageFiles(r.Context(), letterID)
		if err != nil {
			log.Printf("delete page files for letter %d: %v", letterID, err)
			http.Error(w, "could not delete page files", http.StatusInternalServerError)
			return
		}
		for _, p := range paths {
			if isInsideDir(config.filesDir, p) {
				_ = os.Remove(p)
				_ = os.Remove(p + ".thumb.jpg")
			}
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("GET /m/{id}", func(w http.ResponseWriter, r *http.Request) {
		content, err := phonePages.ReadFile("web/phone.html")
		if err != nil {
			http.Error(w, "phone capture page unavailable", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(content)
	})

	return corsMiddleware(config.webOrigin, mux)
}

func corsMiddleware(allowedOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && origin != allowedOrigin {
			http.Error(w, "origin is not allowed", http.StatusForbidden)
			return
		}
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			w.Header().Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

var formTypePattern = regexp.MustCompile(`^[a-z][a-z0-9-]{0,63}$`)
var fieldNamePattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]{0,63}$`)

func validFormType(formType string) bool {
	return formTypePattern.MatchString(formType)
}

func decodeFields(raw json.RawMessage) (map[string]ocr.Field, error) {
	var object map[string]json.RawMessage
	if err := json.Unmarshal(raw, &object); err != nil || len(object) == 0 || len(object) > 100 {
		return nil, fmt.Errorf("fields must be a non-empty object with at most 100 fields")
	}
	fields := make(map[string]ocr.Field, len(object))
	for name, encoded := range object {
		lowerName := strings.ToLower(name)
		if !fieldNamePattern.MatchString(name) || strings.Contains(lowerName, "photo") || strings.Contains(lowerName, "image") || strings.Contains(lowerName, "file") {
			return nil, fmt.Errorf("field name %q is invalid", name)
		}
		var properties map[string]json.RawMessage
		if err := json.Unmarshal(encoded, &properties); err != nil || len(properties) != 2 {
			return nil, fmt.Errorf("field %q must have a value and confidence", name)
		}
		valueJSON, hasValue := properties["value"]
		confidenceJSON, hasConfidence := properties["confidence"]
		if !hasValue || !hasConfidence {
			return nil, fmt.Errorf("field %q must have a value and confidence", name)
		}
		var value *string
		var confidence *float64
		if err := json.Unmarshal(valueJSON, &value); err != nil || value == nil {
			return nil, fmt.Errorf("field %q value must be text", name)
		}
		if err := json.Unmarshal(confidenceJSON, &confidence); err != nil || confidence == nil || *confidence < 0 || *confidence > 100 {
			return nil, fmt.Errorf("field %q confidence must be between 0 and 100", name)
		}
		if len(*value) > 20_000 || containsImagePayload(*value) {
			return nil, fmt.Errorf("field %q contains data that cannot be stored", name)
		}
		fields[name] = ocr.Field{Value: *value, Conf: *confidence}
	}
	return fields, nil
}

func containsImagePayload(value string) bool {
	if strings.HasPrefix(strings.ToLower(value), "data:image/") {
		return true
	}
	candidate := strings.TrimSpace(value)
	if len(candidate) < 128 {
		return false
	}
	for _, encoding := range []*base64.Encoding{
		base64.StdEncoding, base64.RawStdEncoding, base64.URLEncoding, base64.RawURLEncoding,
	} {
		decoded, err := encoding.DecodeString(candidate)
		if err == nil && isImageBytes(decoded) {
			return true
		}
	}
	return false
}

func isImageBytes(data []byte) bool {
	return bytes.HasPrefix(data, []byte{0xff, 0xd8, 0xff}) ||
		bytes.HasPrefix(data, []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}) ||
		bytes.HasPrefix(data, []byte("GIF87a")) ||
		bytes.HasPrefix(data, []byte("GIF89a")) ||
		(len(data) >= 12 && bytes.Equal(data[:4], []byte("RIFF")) && bytes.Equal(data[8:12], []byte("WEBP")))
}

func publishUploadError(s *session.Session, code string) {
	s.Publish(session.Event{Type: "error", Data: code})
}

func clientAddress(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("write JSON response: %v", err)
	}
}

// savePageImages moves processed images from temp session directories to
// permanent filesDir and records them in the database.
func savePageImages(ctx context.Context, config apiConfig, letterID int64, imgs []session.PageImage) error {
	var params []storage.SavePageFileParams
	var tempDirs []string

	for i, img := range imgs {
		pageNo := i + 1
		destDir := filepath.Join(config.filesDir, strconv.FormatInt(letterID, 10))
		if err := os.MkdirAll(destDir, 0o750); err != nil {
			cleanupTempDirs(append(tempDirs, img.Dir))
			return fmt.Errorf("create letter files directory: %w", err)
		}
		destPath := filepath.Join(destDir, fmt.Sprintf("page-%d.png", pageNo))

		data, err := os.ReadFile(img.Path)
		if err != nil {
			cleanupTempDirs(append(tempDirs, img.Dir))
			return fmt.Errorf("read page image %d: %w", pageNo, err)
		}
		if !isImageBytes(data) {
			cleanupTempDirs(append(tempDirs, img.Dir))
			return fmt.Errorf("page image %d is not a recognised image format", pageNo)
		}
		sum := sha256.Sum256(data)
		hash := hex.EncodeToString(sum[:])

		if err := os.WriteFile(destPath, data, 0o640); err != nil {
			cleanupTempDirs(append(tempDirs, img.Dir))
			return fmt.Errorf("write page image %d: %w", pageNo, err)
		}
		params = append(params, storage.SavePageFileParams{
			PageNo:    pageNo,
			Path:      destPath,
			Mime:      "image/png",
			SizeBytes: int64(len(data)),
			Sha256:    hash,
		})
		tempDirs = append(tempDirs, img.Dir)
	}

	if _, err := config.letters.SavePageFiles(ctx, letterID, params); err != nil {
		for _, p := range params {
			_ = os.Remove(p.Path)
		}
		cleanupTempDirs(tempDirs)
		return fmt.Errorf("record page files in database: %w", err)
	}
	cleanupTempDirs(tempDirs)
	return nil
}

func cleanupTempDirs(dirs []string) {
	seen := make(map[string]bool)
	for _, d := range dirs {
		if d != "" && !seen[d] {
			seen[d] = true
			_ = os.RemoveAll(d)
		}
	}
}

// isInsideDir returns true if path is inside dir, preventing path traversal.
func isInsideDir(dir, path string) bool {
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return false
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(absDir, absPath)
	if err != nil {
		return false
	}
	return !strings.HasPrefix(rel, "..") && rel != ".."
}
