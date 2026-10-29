package main

import (
	"bytes"
	"context"
	"embed"
	"encoding/base64"
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
}

type apiConfig struct {
	store     *session.Store
	letters   letterStore
	publicURL string
	webOrigin string
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
		defer func() {
			if err := os.RemoveAll(directory); err != nil {
				log.Printf("remove OCR temporary directory %q: %v", directory, err)
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
			Confirmed *bool           `json:"confirmed"`
			FormType  string          `json:"formType"`
			Fields    json.RawMessage `json:"fields"`
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
		letter, err := config.letters.Save(r.Context(), true, payload.FormType, fields)
		if err != nil {
			log.Printf("save confirmed letter: %v", err)
			http.Error(w, "could not save confirmed letter", http.StatusInternalServerError)
			return
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
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
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
