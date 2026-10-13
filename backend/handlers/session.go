package handlers

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"triscript-backend/ocr"
)

const MaxPhotoBytes = 6 * 1024 * 1024 // 6 MB

type Photo struct {
	Data        []byte
	ContentType string
}

type Session struct {
	ID        string `json:"id"`
	ExpiresAt int64  `json:"expiresAt"`
	Photo     *Photo `json:"-"`
}

type PhotoResult int

const (
	PhotoResultOK PhotoResult = iota
	PhotoResultGone
	PhotoResultAlreadySent
	PhotoResultTooLarge
	PhotoResultBadType
)

type Store struct {
	mu       sync.RWMutex
	sessions map[string]*Session
	ttl      time.Duration
}

func GetTTL() time.Duration {
	ttlStr := os.Getenv("SESSION_TTL_SECONDS")
	if ttlStr == "" {
		return 300 * time.Second
	}
	seconds, err := strconv.ParseInt(ttlStr, 10, 64)
	if err != nil || seconds <= 0 {
		return 300 * time.Second
	}
	return time.Duration(seconds) * time.Second
}

func NewStore(ttl time.Duration) *Store {
	return &Store{
		sessions: make(map[string]*Session),
		ttl:      ttl,
	}
}

func (s *Store) TTL() time.Duration {
	return s.ttl
}

func (s *Store) CleanupExpired() {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UnixMilli()
	for id, session := range s.sessions {
		if session.ExpiresAt <= now {
			if session.Photo != nil {
				session.Photo.Data = nil
				session.Photo = nil
			}
			delete(s.sessions, id)
		}
	}
}

func (s *Store) CreateSession() (*Session, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return nil, errors.New("failed to generate session id")
	}
	id := hex.EncodeToString(b)
	expiresAt := time.Now().Add(s.ttl).UnixMilli()

	s.mu.Lock()
	defer s.mu.Unlock()

	// Proactively clean expired entries
	now := time.Now().UnixMilli()
	for existingID, session := range s.sessions {
		if session.ExpiresAt <= now {
			if session.Photo != nil {
				session.Photo.Data = nil
				session.Photo = nil
			}
			delete(s.sessions, existingID)
		}
	}

	session := &Session{
		ID:        id,
		ExpiresAt: expiresAt,
	}
	s.sessions[id] = session
	return session, nil
}

// SessionStatus is a safe snapshot of a session's observable state.
// Using a value snapshot avoids data races: the caller never holds a pointer
// into the mutable sessions map after the lock is released.
type SessionStatus struct {
	ID        string
	ExpiresAt int64
	HasPhoto  bool
}

func (s *Store) GetSession(id string) (*SessionStatus, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	session, exists := s.sessions[id]
	if !exists {
		return nil, false
	}
	if session.ExpiresAt <= time.Now().UnixMilli() {
		return nil, false
	}
	return &SessionStatus{
		ID:        session.ID,
		ExpiresAt: session.ExpiresAt,
		HasPhoto:  session.Photo != nil,
	}, true
}

func (s *Store) DeleteSession(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	session, exists := s.sessions[id]
	if exists {
		if session.Photo != nil {
			session.Photo.Data = nil
			session.Photo = nil
		}
		delete(s.sessions, id)
		return true
	}
	return false
}

// ValidateImage checks whether data begins with valid magic bytes
// for the given claimed content type (image/jpeg, image/png, image/webp).
func ValidateImage(data []byte, claimedType string) bool {
	if len(data) < 12 {
		return false
	}

	switch claimedType {
	case "image/jpeg":
		// JPEG starts with FF D8 FF
		return data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF

	case "image/png":
		// PNG starts with \x89PNG\r\n\x1a\n
		pngMagic := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
		return bytes.HasPrefix(data, pngMagic)

	case "image/webp":
		// WebP: RIFF [4 bytes size] WEBP
		return len(data) >= 12 &&
			string(data[0:4]) == "RIFF" &&
			string(data[8:12]) == "WEBP"

	default:
		return false
	}
}

func (s *Store) SetPhoto(id string, data []byte, contentType string) PhotoResult {
	if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" {
		return PhotoResultBadType
	}
	if len(data) == 0 || len(data) > MaxPhotoBytes {
		return PhotoResultTooLarge
	}
	if !ValidateImage(data, contentType) {
		return PhotoResultBadType
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	session, exists := s.sessions[id]
	if !exists || session.ExpiresAt <= time.Now().UnixMilli() {
		return PhotoResultGone
	}
	if session.Photo != nil {
		return PhotoResultAlreadySent
	}

	// Defensive copy of slice data
	dataCopy := make([]byte, len(data))
	copy(dataCopy, data)

	session.Photo = &Photo{
		Data:        dataCopy,
		ContentType: contentType,
	}
	return PhotoResultOK
}

func (s *Store) GetPhoto(id string) (*Photo, PhotoResult) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	session, exists := s.sessions[id]
	if !exists || session.ExpiresAt <= time.Now().UnixMilli() {
		return nil, PhotoResultGone
	}
	if session.Photo == nil {
		return nil, PhotoResultGone
	}

	dataCopy := make([]byte, len(session.Photo.Data))
	copy(dataCopy, session.Photo.Data)

	return &Photo{
		Data:        dataCopy,
		ContentType: session.Photo.ContentType,
	}, PhotoResultOK
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func HealthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"message": "TRISCRIPT Go backend is running",
	})
}

// corsMiddleware adds CORS headers when CORS_ALLOWED_ORIGIN is set.
// In the default proxy architecture the browser never contacts Go directly,
// so CORS is not needed. When CORS_ALLOWED_ORIGIN is set to the Next.js
// origin (e.g. http://localhost:3000), direct cross-origin access works too.
func corsMiddleware(next http.Handler) http.Handler {
	origin := os.Getenv("CORS_ALLOWED_ORIGIN")
	if origin == "" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func NewRouter(store Storer) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", HealthHandler)

	// OCR endpoint — called by the Next.js reader adapter.
	// POST /api/read  (multipart: image + uiLang)
	mux.HandleFunc("/api/read", ocr.Handler)

	// Session collection endpoint
	mux.HandleFunc("/api/session", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/session" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		session, err := store.CreateSession()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create session"})
			return
		}

		writeJSON(w, http.StatusCreated, map[string]any{
			"id":        session.ID,
			"expiresAt": session.ExpiresAt,
		})
	})

	// Sub-paths under /api/session/
	mux.HandleFunc("/api/session/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/session/")
		parts := strings.Split(path, "/")

		if len(parts) == 0 || parts[0] == "" {
			http.NotFound(w, r)
			return
		}

		id := parts[0]

		// Route: /api/session/{id}/photo
		if len(parts) == 2 && parts[1] == "photo" {
			handlePhoto(w, r, store, id)
			return
		}

		// Route: /api/session/{id}/result
		if len(parts) == 2 && parts[1] == "result" {
			handleResult(w, r, store, id)
			return
		}

		// Route: /api/session/{id}
		if len(parts) == 1 {
			handleSessionInstance(w, r, store, id)
			return
		}

		http.NotFound(w, r)
	})

	return corsMiddleware(mux)
}

func handleSessionInstance(w http.ResponseWriter, r *http.Request, store Storer, id string) {
	switch r.Method {
	case http.MethodGet:
		snap, exists := store.GetSession(id)
		if !exists {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "gone"})
			return
		}

		status := "waiting"
		if snap.HasPhoto {
			status = "photo"
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"status":    status,
			"expiresAt": snap.ExpiresAt,
		})

	case http.MethodDelete:
		store.DeleteSession(id)
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ResultSaver is an optional extension of Storer for saving OCR results.
// The DB repository implements it; the in-memory store does not.
type ResultSaver interface {
	SaveExtractionResult(ctx context.Context, sessionID, language string, fieldsJSON []byte, readerMode string) error
}

// handleResult stores confirmed OCR field values for a session.
// POST /api/session/{id}/result
// Body: { "language":"en", "readerMode":"demo", "fields":{ ... } }
func handleResult(w http.ResponseWriter, r *http.Request, store Storer, id string) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Only save if the store supports persistence.
	rs, ok := store.(ResultSaver)
	if !ok {
		// In-memory store — accept and silently ignore (no persistence).
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Validate the session still exists.
	if _, exists := store.GetSession(id); !exists {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "gone"})
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 64*1024)) // 64 KB max
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad-body"})
		return
	}

	var req struct {
		Language   string          `json:"language"`
		ReaderMode string          `json:"readerMode"`
		Fields     json.RawMessage `json:"fields"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad-json"})
		return
	}
	if req.Language == "" {
		req.Language = "en"
	}
	if req.ReaderMode != "real" {
		req.ReaderMode = "demo"
	}

	ctx := r.Context()
	if err := rs.SaveExtractionResult(ctx, id, req.Language, req.Fields, req.ReaderMode); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save-failed"})
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}

func handlePhoto(w http.ResponseWriter, r *http.Request, store Storer, id string) {
	switch r.Method {
	case http.MethodPost:
		contentType := strings.TrimSpace(strings.Split(r.Header.Get("Content-Type"), ";")[0])
		if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" {
			writeJSON(w, http.StatusUnsupportedMediaType, map[string]string{"error": "bad-type"})
			return
		}

		// Read up to MaxPhotoBytes + 1 to detect oversized requests properly
		reader := http.MaxBytesReader(w, r.Body, MaxPhotoBytes+1)
		data, err := io.ReadAll(reader)
		if err != nil {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "too-large"})
			return
		}

		if len(data) == 0 || len(data) > MaxPhotoBytes {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "too-large"})
			return
		}

		res := store.SetPhoto(id, data, contentType)
		switch res {
		case PhotoResultOK:
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(http.StatusNoContent)
		case PhotoResultGone:
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "gone"})
		case PhotoResultAlreadySent:
			writeJSON(w, http.StatusConflict, map[string]string{"error": "already-sent"})
		case PhotoResultTooLarge:
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "too-large"})
		case PhotoResultBadType:
			writeJSON(w, http.StatusUnsupportedMediaType, map[string]string{"error": "bad-type"})
		default:
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal-error"})
		}

	case http.MethodGet:
		photo, res := store.GetPhoto(id)
		if res != PhotoResultOK || photo == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "none"})
			return
		}

		w.Header().Set("Content-Type", photo.ContentType)
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(photo.Data)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
