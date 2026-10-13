package db

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"triscript-backend/handlers"
	"triscript-backend/storage"
)

// Repository implements handlers.Storer using PostgreSQL.
type Repository struct {
	pool *pgxpool.Pool
	ttl  time.Duration
}

// NewRepository returns a Repository backed by pool with the given TTL.
func NewRepository(pool *pgxpool.Pool, ttl time.Duration) *Repository {
	return &Repository{pool: pool, ttl: ttl}
}

// TTL returns the configured session lifetime.
func (r *Repository) TTL() time.Duration { return r.ttl }

// ── Session operations ────────────────────────────────────────────────────

// CreateSession inserts a new session row and returns the public Session.
func (r *Repository) CreateSession() (*handlers.Session, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return nil, errors.New("repository: failed to generate session id")
	}
	id := hex.EncodeToString(b)
	expiresAt := time.Now().Add(r.ttl)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	const q = `INSERT INTO sessions (id, status, expires_at) VALUES ($1, 'waiting', $2)`
	if _, err := r.pool.Exec(ctx, q, id, expiresAt); err != nil {
		return nil, fmt.Errorf("repository: insert session: %w", err)
	}
	return &handlers.Session{ID: id, ExpiresAt: expiresAt.UnixMilli()}, nil
}

// GetSession returns a snapshot or (nil, false) for missing/expired sessions.
func (r *Repository) GetSession(id string) (*handlers.SessionStatus, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	const q = `SELECT expires_at, status FROM sessions WHERE id = $1`
	var expiresAt time.Time
	var status string
	if err := r.pool.QueryRow(ctx, q, id).Scan(&expiresAt, &status); err != nil {
		return nil, false
	}
	if time.Now().After(expiresAt) {
		return nil, false
	}
	hasPhoto := status == "photo_uploaded" || status == "processing" ||
		status == "completed" || status == "failed"
	return &handlers.SessionStatus{
		ID:        id,
		ExpiresAt: expiresAt.UnixMilli(),
		HasPhoto:  hasPhoto,
	}, true
}

// DeleteSession removes the session and its photo file.
func (r *Repository) DeleteSession(id string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Fetch the storage key before deleting.
	var key string
	_ = r.pool.QueryRow(ctx,
		`SELECT storage_key FROM session_photos WHERE session_id = $1`, id).Scan(&key)

	tag, err := r.pool.Exec(ctx, `DELETE FROM sessions WHERE id = $1`, id)
	if err != nil || tag.RowsAffected() == 0 {
		return false
	}
	if key != "" {
		_ = storage.Delete(key)
	}
	return true
}

// ── Photo operations ──────────────────────────────────────────────────────

// SetPhoto validates the image, writes the file, and records metadata in a
// single transaction so the DB and filesystem stay consistent.
func (r *Repository) SetPhoto(id string, data []byte, contentType string) handlers.PhotoResult {
	if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" {
		return handlers.PhotoResultBadType
	}
	if len(data) == 0 || len(data) > handlers.MaxPhotoBytes {
		return handlers.PhotoResultTooLarge
	}
	if !handlers.ValidateImage(data, contentType) {
		return handlers.PhotoResultBadType
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return handlers.PhotoResultGone
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Lock the session row and validate it.
	var expiresAt time.Time
	var status string
	err = tx.QueryRow(ctx,
		`SELECT expires_at, status FROM sessions WHERE id = $1 FOR UPDATE`, id,
	).Scan(&expiresAt, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return handlers.PhotoResultGone
	}
	if err != nil {
		return handlers.PhotoResultGone
	}
	if time.Now().After(expiresAt) {
		return handlers.PhotoResultGone
	}
	if status != "waiting" {
		return handlers.PhotoResultAlreadySent
	}

	// Generate storage key and write file before committing.
	key, err := storage.NewKey()
	if err != nil {
		return handlers.PhotoResultGone
	}
	if err := storage.Write(key, data); err != nil {
		return handlers.PhotoResultGone
	}

	// Insert photo metadata row.
	_, err = tx.Exec(ctx,
		`INSERT INTO session_photos (session_id, content_type, file_size, storage_key)
		 VALUES ($1, $2, $3, $4)`,
		id, contentType, len(data), key)
	if err != nil {
		_ = storage.Delete(key)
		return handlers.PhotoResultGone
	}

	// Advance session status.
	_, err = tx.Exec(ctx,
		`UPDATE sessions SET status = 'photo_uploaded', updated_at = NOW() WHERE id = $1`, id)
	if err != nil {
		_ = storage.Delete(key)
		return handlers.PhotoResultGone
	}

	if err := tx.Commit(ctx); err != nil {
		_ = storage.Delete(key)
		return handlers.PhotoResultGone
	}
	return handlers.PhotoResultOK
}

// GetPhoto retrieves image bytes from the filesystem.
func (r *Repository) GetPhoto(id string) (*handlers.Photo, handlers.PhotoResult) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	const q = `
		SELECT sp.storage_key, sp.content_type, s.expires_at
		FROM   session_photos sp
		JOIN   sessions s ON s.id = sp.session_id
		WHERE  sp.session_id = $1`
	var key, contentType string
	var expiresAt time.Time
	if err := r.pool.QueryRow(ctx, q, id).Scan(&key, &contentType, &expiresAt); err != nil {
		return nil, handlers.PhotoResultGone
	}
	if time.Now().After(expiresAt) {
		return nil, handlers.PhotoResultGone
	}
	data, err := storage.Read(key)
	if err != nil {
		return nil, handlers.PhotoResultGone
	}
	return &handlers.Photo{Data: data, ContentType: contentType}, handlers.PhotoResultOK
}

// ── OCR results ───────────────────────────────────────────────────────────

// SaveExtractionResult upserts OCR results for a session.
// fieldsJSON must be valid JSON ([]byte from json.Marshal).
// readerMode should be "demo" or "real".
func (r *Repository) SaveExtractionResult(ctx context.Context, sessionID, language string, fieldsJSON []byte, readerMode string) error {
	const q = `
		INSERT INTO extraction_results (session_id, language, fields_json, reader_mode)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (session_id)
		DO UPDATE SET fields_json = EXCLUDED.fields_json,
		              reader_mode = EXCLUDED.reader_mode,
		              language    = EXCLUDED.language,
		              updated_at  = NOW()`
	_, err := r.pool.Exec(ctx, q, sessionID, language, fieldsJSON, readerMode)
	return err
}

// ── Cleanup ───────────────────────────────────────────────────────────────

// CleanupExpired deletes all expired sessions (cascade removes photos/results)
// and their stored files.  Returns the number of sessions deleted.
func (r *Repository) CleanupExpired(ctx context.Context) (int64, error) {
	// Collect file keys before deleting rows.
	rows, err := r.pool.Query(ctx, `
		SELECT sp.storage_key
		FROM   session_photos sp
		JOIN   sessions s ON s.id = sp.session_id
		WHERE  s.expires_at <= NOW()`)
	if err != nil {
		return 0, fmt.Errorf("cleanup: query keys: %w", err)
	}
	var keys []string
	for rows.Next() {
		var k string
		if rows.Scan(&k) == nil {
			keys = append(keys, k)
		}
	}
	rows.Close()

	tag, err := r.pool.Exec(ctx, `DELETE FROM sessions WHERE expires_at <= NOW()`)
	if err != nil {
		return 0, fmt.Errorf("cleanup: delete sessions: %w", err)
	}
	for _, k := range keys {
		_ = storage.Delete(k)
	}
	return tag.RowsAffected(), nil
}
