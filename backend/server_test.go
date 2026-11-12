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
	store := &memoryMetaStore{}
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

// ─── Metadata store for server tests ─────────────────────────────────────────

type memoryMetaStore struct {
	memoryLetters
	tags          []storage.Tag
	correspondents []storage.Correspondent
	docTypes      []storage.DocumentType
}

func (m *memoryMetaStore) Get(_ context.Context, id int64) (storage.Letter, error) {
	for _, l := range m.saved {
		if l.ID == id {
			return l, nil
		}
	}
	return storage.Letter{}, storage.ErrNotFound
}

func (m *memoryMetaStore) Patch(_ context.Context, id int64, patch storage.LetterPatch) (storage.Letter, error) {
	for i, l := range m.saved {
		if l.ID == id {
			if patch.FormType != nil {
				m.saved[i].FormType = *patch.FormType
			}
			return m.saved[i], nil
		}
	}
	return storage.Letter{}, storage.ErrNotFound
}

func (m *memoryMetaStore) CreateTag(_ context.Context, name, colour string) (storage.Tag, error) {
	tag := storage.Tag{ID: int64(len(m.tags) + 1), Name: name, Colour: colour}
	m.tags = append(m.tags, tag)
	return tag, nil
}

func (m *memoryMetaStore) ListTags(_ context.Context) ([]storage.Tag, error) {
	return m.tags, nil
}

func (m *memoryMetaStore) UpdateTag(_ context.Context, id int64, name, colour string) (storage.Tag, error) {
	for i, t := range m.tags {
		if t.ID == id {
			m.tags[i].Name = name
			m.tags[i].Colour = colour
			return m.tags[i], nil
		}
	}
	return storage.Tag{}, storage.ErrNotFound
}

func (m *memoryMetaStore) DeleteTag(_ context.Context, id int64) error {
	for i, t := range m.tags {
		if t.ID == id {
			m.tags = append(m.tags[:i], m.tags[i+1:]...)
			return nil
		}
	}
	return storage.ErrNotFound
}

func (m *memoryMetaStore) CreateCorrespondent(_ context.Context, name string) (storage.Correspondent, error) {
	c := storage.Correspondent{ID: int64(len(m.correspondents) + 1), Name: name}
	m.correspondents = append(m.correspondents, c)
	return c, nil
}

func (m *memoryMetaStore) ListCorrespondents(_ context.Context) ([]storage.Correspondent, error) {
	return m.correspondents, nil
}

func (m *memoryMetaStore) UpdateCorrespondent(_ context.Context, id int64, name string) (storage.Correspondent, error) {
	for i, c := range m.correspondents {
		if c.ID == id {
			m.correspondents[i].Name = name
			return m.correspondents[i], nil
		}
	}
	return storage.Correspondent{}, storage.ErrNotFound
}

func (m *memoryMetaStore) DeleteCorrespondent(_ context.Context, id int64) error {
	for i, c := range m.correspondents {
		if c.ID == id {
			m.correspondents = append(m.correspondents[:i], m.correspondents[i+1:]...)
			return nil
		}
	}
	return storage.ErrNotFound
}

func (m *memoryMetaStore) SuggestCorrespondent(_ context.Context, q string) ([]storage.Correspondent, error) {
	var result []storage.Correspondent
	for _, c := range m.correspondents {
		if strings.Contains(strings.ToLower(c.Name), strings.ToLower(q)) {
			result = append(result, c)
		}
	}
	return result, nil
}

func (m *memoryMetaStore) CreateDocumentType(_ context.Context, name string) (storage.DocumentType, error) {
	dt := storage.DocumentType{ID: int64(len(m.docTypes) + 1), Name: name}
	m.docTypes = append(m.docTypes, dt)
	return dt, nil
}

func (m *memoryMetaStore) ListDocumentTypes(_ context.Context) ([]storage.DocumentType, error) {
	return m.docTypes, nil
}

func (m *memoryMetaStore) UpdateDocumentType(_ context.Context, id int64, name string) (storage.DocumentType, error) {
	for i, d := range m.docTypes {
		if d.ID == id {
			m.docTypes[i].Name = name
			return m.docTypes[i], nil
		}
	}
	return storage.DocumentType{}, storage.ErrNotFound
}

func (m *memoryMetaStore) DeleteDocumentType(_ context.Context, id int64) error {
	for i, d := range m.docTypes {
		if d.ID == id {
			m.docTypes = append(m.docTypes[:i], m.docTypes[i+1:]...)
			return nil
		}
	}
	return storage.ErrNotFound
}

// ─── Tests ────────────────────────────────────────────────────────────────────

func TestTagEndpoints(t *testing.T) {
	store := &memoryMetaStore{}
	handler := newAPIHandler(apiConfig{
		store: session.NewStore(time.Minute), letters: store,
		publicURL: "http://localhost:8080", webOrigin: "http://localhost:3000",
	})

	// POST /api/tags — missing database handled by missing store (covered below)

	// POST /api/tags — invalid colour
	request := httptest.NewRequest(http.MethodPost, "/api/tags",
		strings.NewReader(`{"name":"TEST Urgent","colour":"notacolour"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("invalid colour: status=%d", response.Code)
	}

	// POST /api/tags — valid
	request = httptest.NewRequest(http.MethodPost, "/api/tags",
		strings.NewReader(`{"name":"TEST Urgent","colour":"#ff0000"}`))
	request.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("create tag: status=%d body=%s", response.Code, response.Body.String())
	}
	var created storage.Tag
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil || created.ID < 1 {
		t.Fatalf("create tag response invalid: %v", err)
	}

	// GET /api/tags
	request = httptest.NewRequest(http.MethodGet, "/api/tags", nil)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "TEST Urgent") {
		t.Fatalf("list tags: status=%d body=%s", response.Code, response.Body.String())
	}

	// PUT /api/tags/{id}
	request = httptest.NewRequest(http.MethodPut, "/api/tags/1",
		strings.NewReader(`{"name":"TEST Land","colour":"#00ff00"}`))
	request.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "TEST Land") {
		t.Fatalf("update tag: status=%d body=%s", response.Code, response.Body.String())
	}

	// DELETE /api/tags/{id}
	request = httptest.NewRequest(http.MethodDelete, "/api/tags/1", nil)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent {
		t.Fatalf("delete tag: status=%d", response.Code)
	}

	// DELETE /api/tags/{id} — not found
	request = httptest.NewRequest(http.MethodDelete, "/api/tags/1", nil)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("delete missing tag: status=%d want 404", response.Code)
	}
}

func TestCorrespondentEndpoints(t *testing.T) {
	store := &memoryMetaStore{}
	handler := newAPIHandler(apiConfig{
		store: session.NewStore(time.Minute), letters: store,
		publicURL: "http://localhost:8080", webOrigin: "http://localhost:3000",
	})

	// POST — empty name
	request := httptest.NewRequest(http.MethodPost, "/api/correspondents",
		strings.NewReader(`{"name":""}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("empty correspondent name: status=%d", response.Code)
	}

	// POST — valid
	request = httptest.NewRequest(http.MethodPost, "/api/correspondents",
		strings.NewReader(`{"name":"TEST Divisional Secretariat"}`))
	request.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("create correspondent: status=%d body=%s", response.Code, response.Body.String())
	}

	// GET — list
	request = httptest.NewRequest(http.MethodGet, "/api/correspondents", nil)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "TEST Divisional Secretariat") {
		t.Fatalf("list correspondents: status=%d body=%s", response.Code, response.Body.String())
	}

	// GET — suggest
	request = httptest.NewRequest(http.MethodGet, "/api/correspondents?suggest=Divisional", nil)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "Divisional") {
		t.Fatalf("suggest correspondents: status=%d body=%s", response.Code, response.Body.String())
	}

	// PUT
	request = httptest.NewRequest(http.MethodPut, "/api/correspondents/1",
		strings.NewReader(`{"name":"TEST Updated Secretariat"}`))
	request.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "TEST Updated Secretariat") {
		t.Fatalf("update correspondent: status=%d body=%s", response.Code, response.Body.String())
	}

	// DELETE
	request = httptest.NewRequest(http.MethodDelete, "/api/correspondents/1", nil)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent {
		t.Fatalf("delete correspondent: status=%d", response.Code)
	}
}

func TestDocumentTypeEndpoints(t *testing.T) {
	store := &memoryMetaStore{}
	handler := newAPIHandler(apiConfig{
		store: session.NewStore(time.Minute), letters: store,
		publicURL: "http://localhost:8080", webOrigin: "http://localhost:3000",
	})

	// POST — valid
	request := httptest.NewRequest(http.MethodPost, "/api/document-types",
		strings.NewReader(`{"name":"TEST Circular"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("create document type: status=%d body=%s", response.Code, response.Body.String())
	}

	// GET — list
	request = httptest.NewRequest(http.MethodGet, "/api/document-types", nil)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "TEST Circular") {
		t.Fatalf("list document types: status=%d body=%s", response.Code, response.Body.String())
	}

	// PUT
	request = httptest.NewRequest(http.MethodPut, "/api/document-types/1",
		strings.NewReader(`{"name":"TEST Internal Memo"}`))
	request.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "TEST Internal Memo") {
		t.Fatalf("update document type: status=%d body=%s", response.Code, response.Body.String())
	}

	// DELETE
	request = httptest.NewRequest(http.MethodDelete, "/api/document-types/1", nil)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent {
		t.Fatalf("delete document type: status=%d", response.Code)
	}

	// DELETE — not found
	request = httptest.NewRequest(http.MethodDelete, "/api/document-types/1", nil)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("delete missing doc type: status=%d want 404", response.Code)
	}
}

func TestPatchLetterEndpoint(t *testing.T) {
	store := &memoryMetaStore{}
	handler := newAPIHandler(apiConfig{
		store: session.NewStore(time.Minute), letters: store,
		publicURL: "http://localhost:8080", webOrigin: "http://localhost:3000",
	})

	// Save a letter first
	body, _ := json.Marshal(map[string]any{
		"confirmed": true, "formType": "letter",
		"fields": map[string]any{"subject": map[string]any{"value": "TEST PATCH LETTER", "confidence": 90}},
	})
	request := httptest.NewRequest(http.MethodPost, "/api/letters", bytes.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("setup letter: status=%d", response.Code)
	}
	var saved storage.Letter
	if err := json.NewDecoder(response.Body).Decode(&saved); err != nil {
		t.Fatalf("decode saved letter: %v", err)
	}

	// PATCH — change formType
	patchBody := strings.NewReader(`{"formType":"leave-application"}`)
	request = httptest.NewRequest(http.MethodPatch, "/api/letters/1", patchBody)
	request.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("patch letter: status=%d body=%s", response.Code, response.Body.String())
	}
	var patched storage.Letter
	if err := json.NewDecoder(response.Body).Decode(&patched); err != nil {
		t.Fatalf("decode patched letter: %v", err)
	}
	if patched.FormType != "leave-application" {
		t.Fatalf("expected formType leave-application, got %q", patched.FormType)
	}

	// PATCH — not found
	request = httptest.NewRequest(http.MethodPatch, "/api/letters/999",
		strings.NewReader(`{"formType":"letter"}`))
	request.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("patch missing letter: status=%d want 404", response.Code)
	}

	// PATCH — missing database
	handlerNoDB := newAPIHandler(apiConfig{
		store: session.NewStore(time.Minute), publicURL: "http://localhost:8080",
		webOrigin: "http://localhost:3000",
	})
	request = httptest.NewRequest(http.MethodPatch, "/api/letters/1",
		strings.NewReader(`{"formType":"letter"}`))
	request.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	handlerNoDB.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("patch without db: status=%d want 503", response.Code)
	}
}

func TestMetadataEndpointsReturnServiceUnavailableWithoutDatabase(t *testing.T) {
	handler := newAPIHandler(apiConfig{
		store: session.NewStore(time.Minute), publicURL: "http://localhost:8080",
		webOrigin: "http://localhost:3000",
	})
	for _, endpoint := range []string{
		"/api/tags", "/api/correspondents", "/api/document-types",
	} {
		for _, method := range []string{http.MethodGet, http.MethodPost} {
			request := httptest.NewRequest(method, endpoint, strings.NewReader(`{}`))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusServiceUnavailable {
				t.Errorf("%s %s: status=%d want 503", method, endpoint, response.Code)
			}
		}
	}
}
