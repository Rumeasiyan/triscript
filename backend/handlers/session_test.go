package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

// Helper sample valid image payloads
func makeValidJPEG() []byte {
	// Minimal valid JPEG header bytes + dummy payload >= 12 bytes
	return []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00}
}

func makeValidPNG() []byte {
	// Minimal valid PNG header (8 bytes) + dummy chunk >= 12 bytes
	return []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D}
}

func makeValidWebP() []byte {
	// RIFF (4 bytes) + size (4 bytes) + WEBP (4 bytes) >= 12 bytes
	return []byte{'R', 'I', 'F', 'F', 0x20, 0x00, 0x00, 0x00, 'W', 'E', 'B', 'P', 'V', 'P', '8', ' '}
}

func TestHealthEndpoint(t *testing.T) {
	store := NewStore(10 * time.Second)
	router := NewRouter(store)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	if cc := rec.Header().Get("Cache-Control"); cc != "no-store" {
		t.Errorf("expected Cache-Control: no-store, got %s", cc)
	}

	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode health response: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status ok, got %s", body["status"])
	}
}

func TestSessionLifecycle(t *testing.T) {
	store := NewStore(10 * time.Second)
	router := NewRouter(store)

	// 1. Create session
	req := httptest.NewRequest(http.MethodPost, "/api/session", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d", rec.Code)
	}

	var sessionResp struct {
		ID        string `json:"id"`
		ExpiresAt int64  `json:"expiresAt"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&sessionResp); err != nil {
		t.Fatalf("failed to decode create session response: %v", err)
	}
	if sessionResp.ID == "" {
		t.Fatal("session ID should not be empty")
	}
	if sessionResp.ExpiresAt <= time.Now().UnixMilli() {
		t.Fatal("session expiresAt must be in the future")
	}

	id := sessionResp.ID

	// 2. Poll session status -> "waiting"
	req = httptest.NewRequest(http.MethodGet, "/api/session/"+id, nil)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	var pollResp struct {
		Status    string `json:"status"`
		ExpiresAt int64  `json:"expiresAt"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&pollResp); err != nil {
		t.Fatalf("failed to decode poll response: %v", err)
	}
	if pollResp.Status != "waiting" {
		t.Fatalf("expected status waiting, got %s", pollResp.Status)
	}

	// 3. Upload photo (valid PNG)
	pngData := makeValidPNG()
	req = httptest.NewRequest(http.MethodPost, "/api/session/"+id+"/photo", bytes.NewReader(pngData))
	req.Header.Set("Content-Type", "image/png")
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected status 204 for photo upload, got %d: %s", rec.Code, rec.Body.String())
	}

	// 4. Poll session status -> "photo"
	req = httptest.NewRequest(http.MethodGet, "/api/session/"+id, nil)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	_ = json.NewDecoder(rec.Body).Decode(&pollResp)
	if pollResp.Status != "photo" {
		t.Fatalf("expected status photo, got %s", pollResp.Status)
	}

	// 5. Retrieve photo
	req = httptest.NewRequest(http.MethodGet, "/api/session/"+id+"/photo", nil)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/png" {
		t.Fatalf("expected Content-Type image/png, got %s", ct)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-store" {
		t.Errorf("expected Cache-Control no-store, got %s", cc)
	}
	if !bytes.Equal(rec.Body.Bytes(), pngData) {
		t.Fatal("retrieved photo data does not match uploaded data")
	}

	// 6. Duplicate upload rejected (409)
	req = httptest.NewRequest(http.MethodPost, "/api/session/"+id+"/photo", bytes.NewReader(pngData))
	req.Header.Set("Content-Type", "image/png")
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("expected status 409 for duplicate upload, got %d", rec.Code)
	}

	// 7. Delete session -> 204
	req = httptest.NewRequest(http.MethodDelete, "/api/session/"+id, nil)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected status 204 on delete, got %d", rec.Code)
	}

	// 8. Confirm session is gone (404)
	req = httptest.NewRequest(http.MethodGet, "/api/session/"+id, nil)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected status 404 for deleted session, got %d", rec.Code)
	}

	// 9. Photo retrieval is also gone (404)
	req = httptest.NewRequest(http.MethodGet, "/api/session/"+id+"/photo", nil)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected status 404 for deleted session photo, got %d", rec.Code)
	}
}

func TestImageFormatsAndValidation(t *testing.T) {
	store := NewStore(10 * time.Second)
	router := NewRouter(store)

	tests := []struct {
		name         string
		contentType  string
		data         []byte
		expectedCode int
	}{
		{
			name:         "Valid JPEG",
			contentType:  "image/jpeg",
			data:         makeValidJPEG(),
			expectedCode: http.StatusNoContent,
		},
		{
			name:         "Valid WebP",
			contentType:  "image/webp",
			data:         makeValidWebP(),
			expectedCode: http.StatusNoContent,
		},
		{
			name:         "Valid PNG",
			contentType:  "image/png",
			data:         makeValidPNG(),
			expectedCode: http.StatusNoContent,
		},
		{
			name:         "Invalid magic bytes (claimed JPEG, sent plain text)",
			contentType:  "image/jpeg",
			data:         []byte("this is not a real jpeg file at all"),
			expectedCode: http.StatusUnsupportedMediaType,
		},
		{
			name:         "Mismatched type (claimed PNG, sent JPEG)",
			contentType:  "image/png",
			data:         makeValidJPEG(),
			expectedCode: http.StatusUnsupportedMediaType,
		},
		{
			name:         "Unsupported content type",
			contentType:  "image/gif",
			data:         []byte("GIF89a1234567890"),
			expectedCode: http.StatusUnsupportedMediaType,
		},
		{
			name:         "Empty image data",
			contentType:  "image/jpeg",
			data:         []byte{},
			expectedCode: http.StatusRequestEntityTooLarge,
		},
		{
			name:         "Too short data",
			contentType:  "image/jpeg",
			data:         []byte{0xFF, 0xD8},
			expectedCode: http.StatusUnsupportedMediaType,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			s, err := store.CreateSession()
			if err != nil {
				t.Fatalf("failed to create session: %v", err)
			}

			req := httptest.NewRequest(http.MethodPost, "/api/session/"+s.ID+"/photo", bytes.NewReader(tc.data))
			req.Header.Set("Content-Type", tc.contentType)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != tc.expectedCode {
				t.Fatalf("expected code %d, got %d (body: %s)", tc.expectedCode, rec.Code, rec.Body.String())
			}
		})
	}
}

func TestOversizedImageUpload(t *testing.T) {
	store := NewStore(10 * time.Second)
	router := NewRouter(store)

	s, err := store.CreateSession()
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}

	// Create payload larger than 6MB
	oversized := make([]byte, MaxPhotoBytes+1024)
	copy(oversized, makeValidJPEG())

	req := httptest.NewRequest(http.MethodPost, "/api/session/"+s.ID+"/photo", bytes.NewReader(oversized))
	req.Header.Set("Content-Type", "image/jpeg")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected status 413 for oversized file, got %d", rec.Code)
	}
}

func TestSessionExpiration(t *testing.T) {
	// Store with 50 millisecond TTL
	store := NewStore(50 * time.Millisecond)
	router := NewRouter(store)

	s, err := store.CreateSession()
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}

	// Sleep 70ms to allow session to expire
	time.Sleep(70 * time.Millisecond)

	// Poll should return 404 gone
	req := httptest.NewRequest(http.MethodGet, "/api/session/"+s.ID, nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for expired session, got %d", rec.Code)
	}

	var errBody map[string]string
	_ = json.NewDecoder(rec.Body).Decode(&errBody)
	if errBody["error"] != "gone" {
		t.Fatalf("expected error: gone, got %s", errBody["error"])
	}

	// Upload to expired session should return 404 gone
	req = httptest.NewRequest(http.MethodPost, "/api/session/"+s.ID+"/photo", bytes.NewReader(makeValidPNG()))
	req.Header.Set("Content-Type", "image/png")
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 uploading to expired session, got %d", rec.Code)
	}
}

func TestConcurrentAccess(t *testing.T) {
	store := NewStore(5 * time.Second)
	router := NewRouter(store)

	const concurrency = 20
	var wg sync.WaitGroup

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()

			// Create session
			req := httptest.NewRequest(http.MethodPost, "/api/session", nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != http.StatusCreated {
				t.Errorf("routine %d: failed to create session", idx)
				return
			}

			var sessionResp struct {
				ID string `json:"id"`
			}
			_ = json.NewDecoder(rec.Body).Decode(&sessionResp)

			// Poll session
			req = httptest.NewRequest(http.MethodGet, "/api/session/"+sessionResp.ID, nil)
			rec = httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Errorf("routine %d: failed to poll session", idx)
				return
			}

			// Upload photo
			req = httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/session/%s/photo", sessionResp.ID), bytes.NewReader(makeValidJPEG()))
			req.Header.Set("Content-Type", "image/jpeg")
			rec = httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if rec.Code != http.StatusNoContent {
				t.Errorf("routine %d: failed to upload photo: %d", idx, rec.Code)
				return
			}

			// Retrieve photo
			req = httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/session/%s/photo", sessionResp.ID), nil)
			rec = httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Errorf("routine %d: failed to retrieve photo: %d", idx, rec.Code)
				return
			}

			// Delete session
			req = httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/session/%s", sessionResp.ID), nil)
			rec = httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if rec.Code != http.StatusNoContent {
				t.Errorf("routine %d: failed to delete session: %d", idx, rec.Code)
				return
			}
		}(i)
	}

	wg.Wait()
}
