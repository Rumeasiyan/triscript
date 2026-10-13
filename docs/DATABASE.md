# TRISCRIPT — Database Setup Guide (Windows)

This guide walks you through setting up PostgreSQL for TRISCRIPT on Windows 11,
from installation to running migrations and starting the app.

---

## 1. Install PostgreSQL on Windows

1. Download the Windows installer from https://www.postgresql.org/download/windows/
2. Run the installer. Accept defaults. **Remember the password you set for the `postgres` superuser.**
3. Finish installation. PostgreSQL starts automatically as a Windows service.

Verify it is running — open a new Command Prompt:

```cmd
psql -U postgres -c "SELECT version();"
```

You will be prompted for the password you chose during installation.

---

## 2. Create the database and application user

Open Command Prompt and run `psql` as the superuser:

```cmd
psql -U postgres
```

Then run these SQL commands (replace `change_me` with a strong password):

```sql
-- Create a restricted application user
CREATE USER triscript_user WITH PASSWORD 'change_me';

-- Create the main database
CREATE DATABASE triscript_db OWNER triscript_user;

-- Create an isolated test database (used only for go test)
CREATE DATABASE triscript_test OWNER triscript_user;

-- Verify
\l triscript_db
\l triscript_test
\q
```

---

## 3. Configure DATABASE_URL

TRISCRIPT reads the connection string from the `DATABASE_URL` environment variable.
Set it in the terminal **before** starting the Go backend:

```cmd
:: Windows Command Prompt — set for this terminal session only
set DATABASE_URL=postgres://triscript_user:change_me@localhost:5432/triscript_db?sslmode=disable
set TEST_DATABASE_URL=postgres://triscript_user:change_me@localhost:5432/triscript_test?sslmode=disable
```

You can also copy `.env.example` to a local file and load it, but **never commit
a file that contains your real password**.

---

## 4. Apply database migrations

Migrations create the tables. Run them from the `backend/` directory:

```cmd
cd backend

:: Apply all pending migrations
go run ./cmd/migrate up

:: Check what has been applied
go run ./cmd/migrate status

:: Roll back the last migration (development only — destroys data)
go run ./cmd/migrate down
```

Expected output after `up`:

```
✓ applied 001_initial_schema
```

Running `up` again is safe — already-applied migrations are skipped.

### What the migrations create

| Table | Purpose |
|-------|---------|
| `sessions` | Pairing session lifecycle and expiry |
| `session_photos` | Photo metadata; bytes are on disk in `photo_storage/` |
| `extraction_results` | OCR output per session (JSONB) |
| `session_events` | Optional audit trail |
| `schema_migrations` | Migration version tracker |

---

## 5. Configure photo storage

Photos are stored privately on disk, **not** in PostgreSQL and **not** in the
Next.js `public/` folder.

The default location is `backend/photo_storage/` (created automatically).
To use a different directory:

```cmd
set PHOTO_STORAGE_DIR=C:\triscript-photos
```

The directory is created with permissions `0700` (owner read/write only).
Never place it inside a publicly served directory.

---

## 6. Start the Go backend

Open a terminal in the `backend/` directory:

```cmd
set DATABASE_URL=postgres://triscript_user:change_me@localhost:5432/triscript_db?sslmode=disable
go run .
```

Expected output:

```
TRISCRIPT: photo storage at C:\...\backend\photo_storage
TRISCRIPT: connected to PostgreSQL (session TTL: 5m0s)
TRISCRIPT Go backend starting on http://localhost:8080
```

If you omit `DATABASE_URL`, the backend uses the in-memory store:

```
TRISCRIPT: using in-memory session store (session TTL: 5m0s)
TRISCRIPT: set DATABASE_URL to persist sessions across restarts
```

---

## 7. Start the Next.js frontend

Open a **second** terminal in the project root:

```cmd
npm run dev
```

Open http://localhost:3000/demo in your browser.

---

## 8. Verify the health endpoint

```cmd
curl http://localhost:8080/health
```

Expected:

```json
{"message":"TRISCRIPT Go backend is running","status":"ok"}
```

---

## 9. Run the tests

### Go backend tests (no database required)

```cmd
cd backend
go test ./...
```

All tests pass without a database. DB tests are skipped unless `TEST_DATABASE_URL` is set.

### Go backend tests with database

```cmd
cd backend
set TEST_DATABASE_URL=postgres://triscript_user:change_me@localhost:5432/triscript_test?sslmode=disable

:: Apply the schema to the test database first
go run ./cmd/migrate up

:: Now run all tests including DB integration tests
go test ./... -v
```

### Next.js tests

```cmd
npm run typecheck
npm run lint
npm run build
```

---

## 10. Inspect the database

Using `psql`:

```cmd
psql -U triscript_user -d triscript_db

-- Show all tables
\dt

-- View sessions
SELECT id, status, created_at, expires_at FROM sessions ORDER BY created_at DESC LIMIT 10;

-- View photos
SELECT session_id, content_type, file_size, created_at FROM session_photos;

-- View OCR results
SELECT session_id, language, reader_mode, created_at FROM extraction_results;

\q
```

Or use **pgAdmin** (installed with PostgreSQL) for a graphical view.

---

## 11. Troubleshooting

### `cannot reach PostgreSQL — check DATABASE_URL`

- PostgreSQL service is not running → open Services (Win+R → `services.msc`) and start it.
- Wrong password or username → re-check `DATABASE_URL`.
- Wrong port → default is 5432; check with `netstat -an | findstr 5432`.

### `relation "sessions" does not exist`

Migrations have not been applied. Run:

```cmd
set DATABASE_URL=...
go run ./cmd/migrate up
```

### Photo file not found

The `photo_storage/` directory was deleted or moved. Set `PHOTO_STORAGE_DIR` to the correct path. The DB row still exists but the file is gone — delete and re-upload.

### `DATABASE_URL is not set`

The backend is running in in-memory mode. Sessions are not persisted. Set the variable before `go run .`.

---

## 12. Backup and restore

```cmd
:: Backup
pg_dump -U triscript_user triscript_db > triscript_backup.sql

:: Restore to a fresh database
psql -U postgres -c "CREATE DATABASE triscript_db OWNER triscript_user;"
psql -U triscript_user -d triscript_db < triscript_backup.sql
```

> Photo files on disk are **not** included in the SQL dump. Back up the `photo_storage/` directory separately.
> Photos are temporary by design and are deleted when sessions expire.

---

## 13. What data is stored and when it is deleted

| Data | Where | Deleted when |
|------|-------|-------------|
| Session ID, status, expiry | `sessions` table in PostgreSQL | Session deleted or expired |
| Photo metadata (content-type, size, key) | `session_photos` table | Session deleted or expired (cascade) |
| Photo bytes | `photo_storage/<key>` file on disk | Session deleted or cleanup runs |
| OCR field values and confidence scores | `extraction_results` table | Session deleted (cascade) |
| Event audit trail | `session_events` table | Session deleted (cascade) |

The background cleanup goroutine runs every 60 seconds and removes expired sessions and their files.

> **Note:** TRISCRIPT processes only fictional test letters marked "TEST LETTER, NOT VALID".
> Do not upload real personal or government documents.
> Deleting a record from PostgreSQL does not guarantee the data is physically erased
> from storage media. For production deployments handling sensitive data, apply
> appropriate disk-level security controls.

---

## 14. Multi-instance production notes

In-memory sessions cannot be shared between Go processes. With PostgreSQL:

- Multiple Go instances **can** share sessions — they all read/write the same database.
- Photo files must also be shared (use a network share, or move to object storage like S3).
- Apply migrations once from one machine before starting any instances.
- Route all traffic through a load balancer; no sticky sessions needed once PostgreSQL is the store.
