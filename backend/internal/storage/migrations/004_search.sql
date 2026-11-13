-- 020_search.sql
-- Full-text search for saved letters (English, Sinhala, Tamil).
-- 'simple' config: no stemming, because PostgreSQL has no Sinhala/Tamil dictionary.
-- Each field in letters.fields is an object: {"value": "...", "confidence": 0-100}.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION letter_search_text(f jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT coalesce(f->'subject'->>'value', '')    || ' ' ||
           coalesce(f->'body'->>'value', '')       || ' ' ||
           coalesce(f->'from'->>'value', '')       || ' ' ||
           coalesce(f->'to'->>'value', '')         || ' ' ||
           coalesce(f->'myNumber'->>'value', '')   || ' ' ||
           coalesce(f->'yourNumber'->>'value', '') || ' ' ||
           coalesce(f->'signedBy'->>'value', '')
$$;

ALTER TABLE letters
    ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', letter_search_text(fields))) STORED;

ALTER TABLE letters
    ADD COLUMN IF NOT EXISTS search_text text
    GENERATED ALWAYS AS (letter_search_text(fields)) STORED;

CREATE INDEX IF NOT EXISTS letters_search_vector_idx
    ON letters USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS letters_search_text_trgm_idx
    ON letters USING GIN (search_text gin_trgm_ops);