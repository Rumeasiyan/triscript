-- Migration 004: full-text search + scanned photo storage

-- Store the preprocessed scanned image (nullable — older rows have none).
ALTER TABLE letters
    ADD COLUMN IF NOT EXISTS image_data BYTEA;

-- Full-text search vector over all string values in the fields JSONB.
-- Cannot use a subquery in a generated column, so we use a plain column
-- updated by an INSERT/UPDATE trigger instead.
ALTER TABLE letters
    ADD COLUMN IF NOT EXISTS search_vec TSVECTOR;

CREATE INDEX IF NOT EXISTS letters_search_vec_idx ON letters USING GIN (search_vec);

-- Function that rebuilds the tsvector from every "value" key in fields.
CREATE OR REPLACE FUNCTION letters_search_vec_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    combined TEXT := '';
    pair     RECORD;
BEGIN
    FOR pair IN SELECT value FROM jsonb_each(NEW.fields)
    LOOP
        IF jsonb_typeof(pair.value) = 'object' THEN
            combined := combined || ' ' || coalesce(pair.value->>'value', '');
        END IF;
    END LOOP;
    NEW.search_vec := to_tsvector('simple', combined);
    RETURN NEW;
END;
$$;

-- Fire on every INSERT and every UPDATE that touches fields.
DROP TRIGGER IF EXISTS letters_search_vec_trig ON letters;
CREATE TRIGGER letters_search_vec_trig
    BEFORE INSERT OR UPDATE OF fields ON letters
    FOR EACH ROW EXECUTE FUNCTION letters_search_vec_update();

-- Back-fill existing rows.
UPDATE letters SET fields = fields WHERE confirmed = TRUE;
