-- Enable trigram extension for partial / OCR-mistake matching.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add a tsvector column using the "simple" configuration so Sinhala and Tamil
-- Unicode text is indexed without stemming (there is no PG dictionary for those
-- scripts).  The column is generated so it stays up-to-date automatically.
ALTER TABLE letters
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(fields->>'subject',   '') || ' ' ||
      coalesce(fields->>'body',      '') || ' ' ||
      coalesce(fields->>'from',      '') || ' ' ||
      coalesce(fields->>'to',        '') || ' ' ||
      coalesce(fields->>'myNumber',  '') || ' ' ||
      coalesce(fields->>'yourNumber','') || ' ' ||
      coalesce(fields->>'signedBy',  '')
    )
  ) STORED;

-- GIN index for full-text (tsvector) lookup.
CREATE INDEX IF NOT EXISTS letters_search_vector_idx
  ON letters USING GIN (search_vector);

-- Trigram indexes for partial / misspelled word matching on the most-searched
-- scalar fields.  Using immutable expression indexes so they work on JSONB.
CREATE INDEX IF NOT EXISTS letters_trgm_subject_idx
  ON letters USING GIN ((fields->>'subject') gin_trgm_ops)
  WHERE confirmed = TRUE;

CREATE INDEX IF NOT EXISTS letters_trgm_body_idx
  ON letters USING GIN ((fields->>'body') gin_trgm_ops)
  WHERE confirmed = TRUE;

CREATE INDEX IF NOT EXISTS letters_trgm_from_idx
  ON letters USING GIN ((fields->>'from') gin_trgm_ops)
  WHERE confirmed = TRUE;
