# TRISCRIPT

TRISCRIPT is an open-source, local-network application for reading a photographed letter and preparing editable fields in English, Sinhala, and Tamil. It uses Tesseract OCR and stores a record only after a person reviews it and explicitly confirms saving.

**Privacy:** uploaded photos are processed on the computer running the backend and removed when OCR finishes. PostgreSQL stores confirmed field values only; it never stores the uploaded photo. The application does not send documents to an external service, and the frontend's Next.js telemetry is disabled by the provided npm and LAN scripts.

## Requirements

- Go 1.22 or later
- Node.js 22 and npm
- PostgreSQL 14 or later
- ImageMagick 7 (`magick` command)
- Tesseract with the `eng`, `sin`, and `tam` trained data installed

The app must be able to run `magick`, `tesseract`, and all three Tesseract languages from its environment. Do not configure ImageMagick 6's `convert` command in place of `magick`.

## Run on Windows

Open two PowerShell terminals in the project directory. Install the requirements above first. PostgreSQL must be running, and the `triscript` login and database must already exist.

### Backend terminal

```powershell
.\backend\run-lan.ps1
```

The launcher securely prompts for the `triscript` PostgreSQL user's password when `DATABASE_URL` is not already set in that PowerShell process. Password entry is hidden. On startup, the backend creates the `letters` table if needed. If started directly with `go run .` and no `DATABASE_URL`, OCR still runs, but saving and listing return HTTP 503; no successful-save message is shown.

### Frontend terminal

```powershell
cd .\frontend
npm ci
$env:NEXT_PUBLIC_API_URL = "http://localhost:8080"
$env:NEXT_PUBLIC_WEB_URL = "http://localhost:3000"
npm run dev
```

Open `http://localhost:3000` on the computer.

### Use a phone on the same Wi-Fi

The phone cannot connect to a `localhost` URL. Stop older TRISCRIPT servers with Ctrl+C in their own terminals, then use two new PowerShell terminals:

```powershell
.\backend\run-lan.ps1
```

```powershell
.\frontend\run-lan.ps1
```

Open the LAN URL printed by the frontend on the computer and scan its new QR code with the phone. Keep both terminals open. The scripts bind the frontend for LAN access and use the computer's active interface address. The phone loads the page and sends API requests through the frontend on port 3000; the backend stays on the computer at port 8080. The computer and phone must be on the same non-isolated network. If the computer's firewall blocks inbound port 3000, allow the frontend on the trusted private network only. Do not weaken firewall settings on an untrusted network.

### Database setup on Windows

Create a local database and login using the PostgreSQL administrator account available on your machine. The Windows LAN launcher prompts securely for the app user's password. For manual runs, set `DATABASE_URL` in the same PowerShell process that starts the backend. If `psql` is not on `PATH`, run it from your PostgreSQL `bin` directory. Do not put real passwords in source files or commit `.env` files.

## Run on Linux

Install Go, Node.js/npm, PostgreSQL, ImageMagick 7, and Tesseract with `eng`, `sin`, and `tam` trained data using your distribution's package manager. Confirm that `magick -version` and `tesseract --list-langs` show the required programs/languages. Start PostgreSQL and create the local database/login before starting TRISCRIPT.

In the first terminal, from the repository root:

```sh
cd backend
export DATABASE_URL='postgres://triscript:YOUR_URL_SAFE_PASSWORD@localhost:5432/triscript?sslmode=disable'
export PUBLIC_URL='http://localhost:8080'
export WEB_ORIGIN='http://localhost:3000'
go run .
```

In the second terminal:

```sh
cd frontend
npm ci
export NEXT_PUBLIC_API_URL='http://localhost:8080'
export NEXT_PUBLIC_WEB_URL='http://localhost:3000'
npm run dev
```

Open `http://localhost:3000`. To use a phone, set `NEXT_PUBLIC_WEB_URL` to the computer's reachable LAN IPv4 on port 3000, set `NEXT_PUBLIC_API_URL` to that LAN address on port 8080 for the pairing URL, and set `TRISCRIPT_API_URL=http://localhost:8080` in the frontend process. Bind the backend to `:8080` and start Next.js with `-H 0.0.0.0`. Phone API requests are proxied through the frontend, so only port 3000 needs to be reachable from the phone. Restrict firewall access to the trusted LAN.

## Docker Compose

Docker and Docker Compose are optional. A Docker build needs access to package registries; once images are built, the services process requests locally and do not require internet access.

1. Copy `.env.example` to `.env`.
2. Replace `POSTGRES_PASSWORD` with a long random alphanumeric password. Keep the password URL-safe, or URL-encode it in the generated PostgreSQL connection string.
3. For phone access, set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WEB_URL` in `.env` to the computer's LAN IPv4, for example `http://192.168.1.20:8080` and `http://192.168.1.20:3000`.
4. Start the services:

```powershell
docker compose up --build -d
```

Use the equivalent command in a Linux terminal. Visit the frontend on port 3000. PostgreSQL's port is published only on the computer's loopback interface; confirmed records persist in the `triscript-data` Docker volume. The backend image includes Tesseract's English, Sinhala, and Tamil language packages plus ImageMagick 7. To stop the services without deleting saved data, run `docker compose down`; do not use `-v` unless you intend to delete the database volume.

## Using TRISCRIPT

1. Open the frontend on the computer and choose the interface language.
2. Scan the QR code using a phone on the same LAN. Photograph each page; choose **Add this page** for intermediate pages and **Finish letter with this page** on the final page. The final page is used for signature extraction.
3. Wait for OCR, then edit every extracted field and inspect the confidence indicators. Low-confidence or undetected fields are left for a person to review; TRISCRIPT does not guess values.
4. Choose **Confirm details**, review the summary, select the explicit confirmation checkbox, and then choose **Save confirmed form**. Until all confirmation steps are completed, no letter is inserted into PostgreSQL.

The leave-application demo uses the same scanner with a different JSON layout at `/forms/leave-application`. Add a new form by placing a validated layout JSON file in `frontend/forms/`; its filename (without `.json`) must match its `id`. The layout lists existing field keys and localized message keys. This changes presentation and saved `formType`, not the OCR engine.

## API

- `POST /api/sessions` — create a five-minute phone pairing session (limited to 10 creations per client IP per minute).
- `GET /api/sessions/{id}/events` — receive OCR progress/results over server-sent events.
- `POST /api/sessions/{id}/photo?t=TOKEN` — upload one page, with a required per-session token and a 12 MiB request limit. Add `complete=false` for an intermediate page.
- `POST /api/letters` — store editable fields only when the JSON body includes `confirmed: true` and a valid `formType`.
- `GET /api/letters?limit=100` — list confirmed field records only; the maximum page size is 100.
- `GET /healthz` — backend health check.

The API permits browser CORS requests only from the configured `WEB_ORIGIN`. Database endpoints return HTTP 503 when `DATABASE_URL` is not configured. Photos are never accepted as database fields or inserted into PostgreSQL.

## Tests and sample accuracy report

From `backend` in PowerShell:

```powershell
go test -count=1 ./...
go vet ./...
```

The image-quality tests use ImageMagick. PostgreSQL integration tests run only when `TEST_DATABASE_URL` is set and use invented `TEST` field values.

To run the accuracy report against the included local sample set (the sample files are not included in this repository):

```powershell
.\backend\scripts\accuracy-report.ps1
```

The script prints each field and its OCR confidence for the English, Tamil, and Sinhala sample letters.

## License and contributing

TRISCRIPT is licensed under the [Mozilla Public License 2.0](./LICENSE). See [CONTRIBUTING.md](./CONTRIBUTING.md), [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md), and the [English user guide](./docs/USER_GUIDE.md).
