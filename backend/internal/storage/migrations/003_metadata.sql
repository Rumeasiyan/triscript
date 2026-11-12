-- Migration 030: tags, correspondents, document types and letter metadata
-- Depends on 001_letters.sql

CREATE TABLE IF NOT EXISTS tags (
    id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT   NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
    colour TEXT NOT NULL DEFAULT '#6366f1' CHECK (colour ~ '^#[0-9a-fA-F]{6}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS correspondents (
    id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT   NOT NULL CHECK (length(name) BETWEEN 1 AND 128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS document_types (
    id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT   NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name)
);

-- Add nullable metadata columns to letters if they don't exist yet.
ALTER TABLE letters
    ADD COLUMN IF NOT EXISTS correspondent_id BIGINT REFERENCES correspondents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS document_type_id BIGINT REFERENCES document_types(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS letter_tags (
    letter_id BIGINT NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
    tag_id    BIGINT NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
    PRIMARY KEY (letter_id, tag_id)
);

CREATE INDEX IF NOT EXISTS letter_tags_tag_id_idx ON letter_tags (tag_id);
