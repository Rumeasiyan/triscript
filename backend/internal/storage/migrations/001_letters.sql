CREATE TABLE IF NOT EXISTS letters (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    confirmed BOOLEAN NOT NULL CHECK (confirmed = TRUE),
    form_type TEXT NOT NULL CHECK (length(form_type) BETWEEN 1 AND 64),
    fields JSONB NOT NULL CHECK (jsonb_typeof(fields) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
