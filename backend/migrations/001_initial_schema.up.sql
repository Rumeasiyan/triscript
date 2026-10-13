-- Migration 001 — Initial schema for TRISCRIPT
-- Apply:   cd backend && go run ./cmd/migrate up
-- Rollback: cd backend && go run ./cmd/migrate down

-- ── sessions ──────────────────────────────────────────────────────────────
-- Stores the lifecycle of each computer-to-phone pairing session.
-- The id is a 32-char lowercase hex string (16 random bytes), matching the
-- existing in-memory store format so the public API is unchanged.

CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT        PRIMARY KEY,
    status      TEXT        NOT NULL DEFAULT 'waiting'
                            CHECK (status IN (
                                'waiting', 'photo_uploaded', 'processing',
                                'completed', 'failed', 'expired')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status      ON sessions (status);

-- ── session_photos ────────────────────────────────────────────────────────
-- Stores metadata about the image uploaded from the phone.
-- The actual bytes live in the private photo_storage/ directory on disk,
-- identified by storage_key (a 32-char random hex string).

CREATE TABLE IF NOT EXISTS session_photos (
    id           BIGSERIAL   PRIMARY KEY,
    session_id   TEXT        NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    content_type TEXT        NOT NULL
                             CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
    file_size    INTEGER     NOT NULL CHECK (file_size > 0 AND file_size <= 6291456), -- max 6 MB
    storage_key  TEXT        NOT NULL UNIQUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT   uq_one_photo_per_session UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS idx_session_photos_session ON session_photos (session_id);

-- ── extraction_results ────────────────────────────────────────────────────
-- Stores OCR output for a session.
-- fields_json holds the normalised field values and confidence scores.
-- reader_mode distinguishes actual OCR ("real") from demo fallback ("demo").

CREATE TABLE IF NOT EXISTS extraction_results (
    id          BIGSERIAL   PRIMARY KEY,
    session_id  TEXT        NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    language    TEXT        NOT NULL DEFAULT 'en'
                            CHECK (language IN ('en', 'si', 'ta', 'mixed')),
    fields_json JSONB       NOT NULL DEFAULT '{}',
    reader_mode TEXT        NOT NULL DEFAULT 'demo'
                            CHECK (reader_mode IN ('real', 'demo')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT  uq_one_result_per_session UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS idx_extraction_results_session ON extraction_results (session_id);

-- ── session_events ────────────────────────────────────────────────────────
-- Optional audit trail.  Rows are appended, never updated.
-- No image data, no personal information, no full document text.

CREATE TABLE IF NOT EXISTS session_events (
    id            BIGSERIAL   PRIMARY KEY,
    session_id    TEXT        NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    event_type    TEXT        NOT NULL
                              CHECK (event_type IN (
                                  'session_created', 'photo_uploaded',
                                  'extraction_completed', 'session_deleted',
                                  'session_expired')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events (session_id);
CREATE INDEX IF NOT EXISTS idx_session_events_type    ON session_events (event_type);
