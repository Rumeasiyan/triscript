package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Rumeasiyan/triscript/backend/internal/ocr"
	"github.com/Rumeasiyan/triscript/backend/internal/session"
	"github.com/Rumeasiyan/triscript/backend/internal/storage"
)

type memoryLetters struct {
	saved     []storage.Letter
	confirmed bool
}

func (m *memoryLetters) Save(_ context.Context, confirmed bool, formType string, fields map[string]ocr.Field) (storage.Letter, error) {
	encoded, err := json.Marshal(fields)
	if err != nil {
		return storage.Letter{}, err
	}
	letter := storage.Letter{
		ID: int64(len(m.saved) + 1), Confirmed: confirmed, FormType: formType,
		Fields: encoded, CreatedAt: time.Now(),
	}
	m.confirmed = confirmed
	m.saved = append(m.saved, letter)
	return letter, nil
}

func (m *memoryLetters) List(_ context.Context, _ int) ([]storage.Letter, error) {
	return m.saved, nil
}

func TestSessionCreationIsRateLimitedAndCorsIsRestricted(t *testing.T) {
	handler := newAPIHandler(apiConfig{
		store: session.NewStore(5 * time.Minute), publicURL: "http://localhost:8080",
		webOrigin: "http://localhost:3000",
	})
	for i := 0; i < sessionRate; i++ {
		request := httptest.NewRequest(http.MethodPost, "/api/sessions", nil)
		request.RemoteAddr = "192.0.2.15:1234"
		request.Header.Set("Origin", "http://localhost:3000")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusCreated {
			t.Fatalf("session %d status = %d, want %d", i+1, response.Code, http.StatusCreated)
		}
		if response.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
			t.Fatal("configured frontend origin was not allowed")
		}
	}
	request := httptest.NewRequest(http.MethodPost, "/api/sessions", nil)
	request.RemoteAddr = "192.0.2.15:1234"
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("rate-limited status = %d, want %d", response.Code, http.StatusTooManyRequests)
	}

	request = httptest.NewRequest(http.MethodOptions, "/api/letters", nil)
	request.Header.Set("Origin", "http://untrusted.example")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("untrusted origin status = %d, want %d", response.Code, http.StatusForbidden)
	}
}

func TestConfirmedLettersRequireExplicitConfirmationAndListOnlySavedRecords(t *testing.T) {
	store := &memoryLetters{}
	handler := newAPIHandler(apiConfig{
		store: session.NewStore(time.Minute), letters: store,
		publicURL: "http://localhost:8080", webOrigin: "http://localhost:3000",
	})
	fields := map[string]ocr.Field{
		"subject": {Value: "TEST SUBJECT", Conf: 90},
		"body":    {Value: "TEST BODY", Conf: 88},
	}

	for _, body := range []string{
		`{"formType":"letter","fields":{"subject":{"value":"TEST SUBJECT","confidence":90}}}`,
		`{"confirmed":false,"formType":"letter","fields":{"subject":{"value":"TEST SUBJECT","confidence":90}}}`,
	} {
		request := httptest.NewRequest(http.MethodPost, "/api/letters", strings.NewReader(body))
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest || len(store.saved) != 0 {
			t.Fatalf("unconfirmed request status=%d saved=%d", response.Code, len(store.saved))
		}
	}

	body, err := json.Marshal(map[string]any{
		"confirmed": true, "formType": "leave-application", "fields": fields,
	})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/letters", bytes.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated || len(store.saved) != 1 || !store.confirmed {
		t.Fatalf("confirmed save status=%d saved=%d", response.Code, len(store.saved))
	}
	if store.saved[0].FormType != "leave-application" {
		t.Fatalf("formType = %q", store.saved[0].FormType)
	}

	request = httptest.NewRequest(http.MethodGet, "/api/letters", nil)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "TEST SUBJECT") {
		t.Fatalf("list status=%d response=%s", response.Code, response.Body.String())
	}
}

func TestLetterApiRejectsPhotosAndMissingDatabase(t *testing.T) {
	photoBytes := append([]byte{0xff, 0xd8, 0xff}, bytes.Repeat([]byte{0}, 256)...)
	encoded := json.RawMessage(`{"photo":{"value":"` + base64.StdEncoding.EncodeToString(photoBytes) + `","confidence":100}}`)
	if _, err := decodeFields(encoded); err == nil {
		t.Fatal("photo field was accepted")
	}
	if !containsImagePayload("data:image/png;base64,abc") {
		t.Fatal("image data URI was not identified")
	}

	handler := newAPIHandler(apiConfig{
		store: session.NewStore(time.Minute), publicURL: "http://localhost:8080",
		webOrigin: "http://localhost:3000",
	})
	request := httptest.NewRequest(http.MethodPost, "/api/letters", strings.NewReader(
		`{"confirmed":true,"formType":"letter","fields":{"body":{"value":"TEST BODY","confidence":90}}}`,
	))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("missing database status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
}

func TestInvalidPhotoUploadLeavesNoTemporaryFilesAndRequiresToken(t *testing.T) {
	store := session.NewStore(time.Minute)
	s := store.New()
	handler := newAPIHandler(apiConfig{
		store: store, publicURL: "http://localhost:8080", webOrigin: "http://localhost:3000",
	})

	request := httptest.NewRequest(http.MethodPost, "/api/sessions/"+s.ID+"/photo", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("missing token status = %d, want %d", response.Code, http.StatusUnauthorized)
	}

	before := triscriptTempFiles(t)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("photo", "test.jpg")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.WriteString(part, "not an image"); err != nil {
		t.Fatal(err)
	}
	if err := writer.WriteField("complete", "true"); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request = httptest.NewRequest(http.MethodPost, "/api/sessions/"+s.ID+"/photo?t="+s.Token, &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError && response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid image status = %d, body=%s", response.Code, response.Body.String())
	}
	after := triscriptTempFiles(t)
	if !equalStrings(before, after) {
		t.Fatalf("temporary upload files remain: before=%v after=%v", before, after)
	}
}

func triscriptTempFiles(t *testing.T) []string {
	t.Helper()
	entries, err := os.ReadDir(os.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), "triscript-") {
			names = append(names, entry.Name())
		}
	}
	return names
}

func equalStrings(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}
