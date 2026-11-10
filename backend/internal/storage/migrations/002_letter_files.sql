CREATE TABLE IF NOT EXISTS letter_files (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    letter_id  BIGINT NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
    page_no    INT    NOT NULL CHECK (page_no >= 1),
    path       TEXT   NOT NULL CHECK (length(path) BETWEEN 1 AND 1024),
    mime       TEXT   NOT NULL DEFAULT 'image/png',
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
    sha256     TEXT   NOT NULL CHECK (length(sha256) = 64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (letter_id, page_no)
);
