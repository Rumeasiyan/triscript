package db_test

// Integration tests for the PostgreSQL repository.
//
// These tests require a running PostgreSQL instance and the schema to exist.
// Set TEST_DATABASE_URL before running:
//
//	set TEST_DATABASE_URL=postgres://triscript_user:password@localhost:5432/triscript_test?sslmode=disable
//	go test ./db/... -v
//
// If TEST_DATABASE_URL is not set, the tests are skipped — they do not
// require a database to run the rest of the test suite.

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"triscript-backend/db"
	"triscript-backend/handlers"
	"triscript-backend/storage"
)

// testPool creates a pool to the test database.
// Tests are skipped if TEST_DATABASE_URL is not set.
func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set — skipping database integration tests")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pgxpool.New: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Fatalf("cannot ping test database: %v", err)
	}
	return pool
}

// cleanDB truncates all tables before each test for isolation.
func cleanDB(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := pool.Exec(ctx, `TRUNCATE sessions, session_photos, extraction_results, session_events RESTART IDENTITY CASCADE`)
	if err != nil {
		t.Fatalf("clean db: %v", err)
	}
}

func initStorage(t *testing.T) {
	t.Helper()
	dir := t.TempDir()
	if err := storage.Init(dir); err != nil {
		t.Fatalf("storage.Init: %v", err)
	}
}

// ── Tests ─────────────────────────────────────────────────────────────────

func TestDBConnection(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("ping failed: %v", err)
	}
}

func TestDBCreateAndGetSession(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	cleanDB(t, pool)
	initStorage(t)

	repo := db.NewRepository(pool, 10*time.Second)

	sess, err := repo.CreateSession()
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}
	if sess.ID == "" {
		t.Fatal("expected non-empty session ID")
	}
	if sess.ExpiresAt <= time.Now().UnixMilli() {
		t.Fatal("expiresAt must be in the future")
	}

	snap, ok := repo.GetSession(sess.ID)
	if !ok {
		t.Fatal("GetSession: expected to find session")
	}
	if snap.ID != sess.ID {
		t.Fatalf("id mismatch: got %s want %s", snap.ID, sess.ID)
	}
	if snap.HasPhoto {
		t.Fatal("new session must not have a photo")
	}
}

func TestDBSessionExpiration(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	cleanDB(t, pool)
	initStorage(t)

	// Very short TTL
	repo := db.NewRepository(pool, 50*time.Millisecond)
	sess, err := repo.CreateSession()
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	_, ok := repo.GetSession(sess.ID)
	if ok {
		t.Fatal("expected session to be expired")
	}
}

func TestDBPhotoUploadAndRetrieval(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	cleanDB(t, pool)
	initStorage(t)

	repo := db.NewRepository(pool, 10*time.Second)
	sess, _ := repo.CreateSession()

	png := makeValidPNG()
	result := repo.SetPhoto(sess.ID, png, "image/png")
	if result != handlers.PhotoResultOK {
		t.Fatalf("SetPhoto: got %d, want PhotoResultOK", result)
	}

	// Status should show HasPhoto
	snap, ok := repo.GetSession(sess.ID)
	if !ok {
		t.Fatal("session gone after photo upload")
	}
	if !snap.HasPhoto {
		t.Fatal("expected HasPhoto to be true")
	}

	// Retrieve photo
	photo, res := repo.GetPhoto(sess.ID)
	if res != handlers.PhotoResultOK {
		t.Fatalf("GetPhoto: got %d, want PhotoResultOK", res)
	}
	if photo.ContentType != "image/png" {
		t.Fatalf("content type: got %s want image/png", photo.ContentType)
	}
	if len(photo.Data) != len(png) {
		t.Fatalf("data length mismatch: got %d want %d", len(photo.Data), len(png))
	}
}

func TestDBDuplicatePhotoRejected(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	cleanDB(t, pool)
	initStorage(t)

	repo := db.NewRepository(pool, 10*time.Second)
	sess, _ := repo.CreateSession()

	png := makeValidPNG()
	repo.SetPhoto(sess.ID, png, "image/png")

	result := repo.SetPhoto(sess.ID, png, "image/png")
	if result != handlers.PhotoResultAlreadySent {
		t.Fatalf("expected PhotoResultAlreadySent on duplicate, got %d", result)
	}
}

func TestDBDeleteSessionCleansPhoto(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	cleanDB(t, pool)
	initStorage(t)

	repo := db.NewRepository(pool, 10*time.Second)
	sess, _ := repo.CreateSession()
	repo.SetPhoto(sess.ID, makeValidPNG(), "image/png")

	ok := repo.DeleteSession(sess.ID)
	if !ok {
		t.Fatal("DeleteSession returned false")
	}

	_, found := repo.GetSession(sess.ID)
	if found {
		t.Fatal("session should be gone after delete")
	}
	_, res := repo.GetPhoto(sess.ID)
	if res == handlers.PhotoResultOK {
		t.Fatal("photo should be gone after session delete")
	}
}

func TestDBPhotoUploadToExpiredSession(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	cleanDB(t, pool)
	initStorage(t)

	repo := db.NewRepository(pool, 50*time.Millisecond)
	sess, _ := repo.CreateSession()

	time.Sleep(100 * time.Millisecond)

	result := repo.SetPhoto(sess.ID, makeValidPNG(), "image/png")
	if result != handlers.PhotoResultGone {
		t.Fatalf("expected PhotoResultGone for expired session, got %d", result)
	}
}

func TestDBCleanupExpired(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	cleanDB(t, pool)
	initStorage(t)

	repo := db.NewRepository(pool, 50*time.Millisecond)
	sess, _ := repo.CreateSession()
	repo.SetPhoto(sess.ID, makeValidPNG(), "image/png")

	time.Sleep(100 * time.Millisecond)

	ctx := context.Background()
	n, err := repo.CleanupExpired(ctx)
	if err != nil {
		t.Fatalf("CleanupExpired: %v", err)
	}
	if n == 0 {
		t.Fatal("expected at least 1 expired session to be cleaned up")
	}

	_, found := repo.GetSession(sess.ID)
	if found {
		t.Fatal("session should be gone after cleanup")
	}
}

func TestDBSaveExtractionResult(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	cleanDB(t, pool)
	initStorage(t)

	repo := db.NewRepository(pool, 10*time.Second)
	sess, _ := repo.CreateSession()

	fields := map[string]any{
		"subject": map[string]any{"value": "TEST LETTER, NOT VALID", "confidence": 0.96},
	}
	fieldsJSON, _ := json.Marshal(fields)

	ctx := context.Background()
	if err := repo.SaveExtractionResult(ctx, sess.ID, "en", fieldsJSON, "demo"); err != nil {
		t.Fatalf("SaveExtractionResult: %v", err)
	}

	// Upsert should not fail
	if err := repo.SaveExtractionResult(ctx, sess.ID, "en", fieldsJSON, "real"); err != nil {
		t.Fatalf("SaveExtractionResult upsert: %v", err)
	}
}

func TestDBBadImageRejected(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	cleanDB(t, pool)
	initStorage(t)

	repo := db.NewRepository(pool, 10*time.Second)
	sess, _ := repo.CreateSession()

	result := repo.SetPhoto(sess.ID, []byte("not a real image"), "image/jpeg")
	if result != handlers.PhotoResultBadType {
		t.Fatalf("expected PhotoResultBadType, got %d", result)
	}
}

// ── Image helpers (same as session_test.go) ───────────────────────────────

func makeValidPNG() []byte {
	return []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D}
}
