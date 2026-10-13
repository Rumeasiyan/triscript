-- Rollback migration 001 — drops all tables created by 001_initial_schema.up.sql
-- WARNING: This destroys all session, photo, extraction, and event data.
-- Only run this on a development database.  Never run on production data.

DROP TABLE IF EXISTS session_events      CASCADE;
DROP TABLE IF EXISTS extraction_results  CASCADE;
DROP TABLE IF EXISTS session_photos      CASCADE;
DROP TABLE IF EXISTS sessions            CASCADE;
