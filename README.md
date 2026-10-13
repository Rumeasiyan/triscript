# TRISCRIPT

**TRISCRIPT turns a phone photo of a letter into filled-in fields on a computer, in Sinhala, Tamil and English.**

Scan a QR code on your computer, photograph the letter with your phone, and the details appear on the computer for you to check — no typing, no app to install.

> **Only invented test letters are used.** Mark them "TEST LETTER, NOT VALID", with reference numbers starting `TEST/`. Never add real letters, real names, real reference numbers, official letterheads, government seals, or authentic official documents.

> **Status:** starting. Built in the open by the Eastern Province IT Volunteer Programme, Sri Lanka.

---

## Architecture

```
Phone browser           Next.js (port 3000)        Go backend (port 8080)
     │                        │                            │
     │── GET /capture/{id} ──►│                            │
     │                        │                            │
     │── POST /api/session/   │── POST /api/session ──────►│ creates session
     │      {id}/photo ──────►│── POST /api/session/       │ stores photo
     │                        │      {id}/photo ──────────►│
     │                        │                            │
Computer browser        Next.js proxies             Go is authoritative
     │── POST /api/session ──►│── POST /api/session ──────►│
     │── GET /api/session/    │── GET /api/session/{id} ──►│ polls status
     │      {id} (poll) ──────│                            │
     │── GET /api/session/    │── GET /api/session/        │
     │      {id}/photo ───────│      {id}/photo ──────────►│ retrieves photo
```

- **Go backend** is the single source of truth for sessions and photos. It stores everything in memory.
- **Next.js** proxies all session and photo API calls to Go. It does not duplicate session state.
- **Phone** talks only to the Next.js server (never directly to Go).

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 18 LTS or later |
| npm | 9 or later (comes with Node.js) |
| Go | 1.21 or later |

---

## Installation (Windows)

```powershell
# 1. Clone the repository
git clone https://github.com/your-org/triscript.git
cd triscript

# 2. Install Node.js dependencies
npm install

# 3. Copy the environment template
copy .env.example .env.local
```

---

## Environment variables

Edit `.env.local` in the project root. Required:

```dotenv
# URL of the Go backend — used by Next.js server-side only, never exposed to the browser.
GO_API_URL=http://localhost:8080

# Address the PHONE can reach the Next.js server on.
# Leave empty for the server to auto-detect from the LAN IP.
# On a local network, set this to your computer's LAN IP, e.g. http://192.168.1.20:3000
NEXT_PUBLIC_PUBLIC_URL=

# Optional: URL of a TRISCRIPT reader (OCR) service.
# POST multipart form (field "image", field "uiLang") → JSON { "fields": { ... } }
# Leave empty to use the built-in DEMO reader, which returns invented TEST values.
NEXT_PUBLIC_TRISCRIPT_READER_URL=

# How long a pairing QR code lasts, in seconds (default 300 = 5 minutes).
SESSION_TTL_SECONDS=300
```

`GO_API_URL` is a **server-side-only** variable (no `NEXT_PUBLIC_` prefix). It is never sent to the browser.

---

## Running on Windows

### 1. Start the Go backend

Open a terminal in the `backend` directory:

```powershell
cd backend
go run .
```

You should see:
```
TRISCRIPT Go backend starting on http://localhost:8080 (session TTL: 5m0s)
```

Leave this terminal running.

### 2. Start the Next.js frontend

Open a second terminal in the project root:

```powershell
npm run dev
```

This starts Next.js on `http://localhost:3000` and binds to `0.0.0.0` (all interfaces), which allows the phone to connect on the same Wi-Fi.

Open **http://localhost:3000/demo** on the computer.

---

## Phone QR pairing — local network setup

For the phone to open the QR code link it must reach the computer. The phone and computer must be on the same Wi-Fi network.

### Automatic (recommended)

The server tries to detect the computer's LAN IP automatically. If the QR link shows a warning that it uses `localhost`, set the IP manually (see below).

### Manual

1. Find your computer's LAN IP address:
   ```powershell
   ipconfig
   ```
   Look for the `IPv4 Address` under your Wi-Fi adapter, e.g. `192.168.1.42`.

2. Add it to `.env.local`:
   ```dotenv
   NEXT_PUBLIC_PUBLIC_URL=http://192.168.1.42:3000
   ```

3. Restart the Next.js dev server (`Ctrl+C`, then `npm run dev` again).

The QR code will now contain `http://192.168.1.42:3000/capture/{id}`, which the phone can open.

### Firewall

Windows Firewall may block incoming connections on port 3000. If the phone cannot load the capture page:

1. Open Windows Defender Firewall with Advanced Security.
2. Add an **Inbound Rule**: TCP port 3000, allow for Domain and Private networks.

Do **not** expose Go's port 8080 publicly. The phone only needs port 3000.

---

## Go backend API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{"status":"ok"}` |
| `POST` | `/api/session` | Create a session → `{"id":"…","expiresAt":…}` (201) |
| `GET` | `/api/session/{id}` | Poll status → `{"status":"waiting"\|"photo","expiresAt":…}` (200) or `{"error":"gone"}` (404) |
| `DELETE` | `/api/session/{id}` | Delete session and photo (204) |
| `POST` | `/api/session/{id}/photo` | Upload photo (204); 404 gone, 409 duplicate, 413 too large, 415 bad type |
| `GET` | `/api/session/{id}/photo` | Retrieve photo bytes (200) or 404 |

All endpoints return `Cache-Control: no-store`.

Configure session lifetime with `SESSION_TTL_SECONDS` (default 300 seconds).

---

## OCR reader configuration

`src/lib/reader.ts` is the single integration point.

- **Demo mode (default):** when `NEXT_PUBLIC_TRISCRIPT_READER_URL` is empty, the demo reader returns invented TEST values after a 1.4-second delay. The review screen shows a prominent "Demo reader" notice.
- **Real reader:** set `NEXT_PUBLIC_TRISCRIPT_READER_URL` to the URL of your OCR service. The service must accept `POST` multipart form data with fields `image` (the photo file) and `uiLang` (the UI language code: `en`, `si`, or `ta`). It must return JSON:
  ```json
  {
    "fields": {
      "subject":    { "value": "...", "confidence": 0.96 },
      "myNumber":   { "value": "...", "confidence": 0.93 },
      "yourNumber": { "value": "...", "confidence": 0.71 },
      "date":       { "value": "...", "confidence": 0.90 },
      "from":       { "value": "...", "confidence": 0.88 },
      "to":         { "value": "...", "confidence": 0.82 },
      "signedBy":   { "value": "...", "confidence": 0.38 },
      "language":   { "value": "en",  "confidence": 0.97 },
      "body":       { "value": "...", "confidence": 0.84 }
    }
  }
  ```
  Any field with confidence below 0.5 is cleared before display. The reader has a 30-second timeout.

Do not send photos to third-party services without reviewing their data-handling policies.

---

## Testing

### Go backend

```powershell
cd backend
gofmt -l .           # should print nothing (no formatting issues)
go vet ./...         # should print nothing
go test ./...        # should print ok for both packages
go test -v ./...     # verbose: see individual test names
```

Tests cover: health endpoint, session lifecycle (create/poll/upload/retrieve/delete), JPEG/PNG/WebP validation, oversized files, invalid magic bytes, expiration, duplicate upload, concurrent access.

### Next.js frontend

```powershell
npm run typecheck    # TypeScript type check (no output = pass)
npm run lint         # ESLint (no output = pass)
npm run build        # production build (must complete without errors)
```

### Manual end-to-end test procedure

Requirements: one computer, one phone on the same Wi-Fi, a fictional test letter marked **TEST LETTER, NOT VALID**.

1. Start the Go backend: `cd backend; go run .`
2. Start the frontend: `npm run dev`
3. On the computer, open `http://localhost:3000/demo`
4. Click "Show the code". A QR code appears with a countdown timer.
5. On the phone, open the camera app and scan the QR code.
   - If the phone cannot load the page, check the firewall and set `NEXT_PUBLIC_PUBLIC_URL`.
6. The phone opens the capture page. Read the test-document notice.
7. Tap "Take a photo" and photograph the fictional test letter.
8. Check the preview. Tap "Use this photo".
9. The phone shows "Done. Look at your computer."
10. The computer detects the photo (within ~1.5 seconds) and shows the reading spinner.
11. After ~1.4 seconds (demo reader), the review form appears with invented test values.
12. The review screen shows "Demo reader: these values are invented test data".
13. Check and correct any field. Tick "I have checked these details". Click "Save details".
14. The computer shows "Saved. The details were saved and the photo was deleted."

> Manual tests above have **not** been executed by the automated agent — they require a physical phone and real Wi-Fi.

---

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home: how it works, languages, privacy |
| `/demo` | Scan a letter end to end |
| `/register` | Reuse demo — shows `<ScanLetter />` in a second context |
| `/capture/[sessionId]` | Phone capture page opened by the QR code |
| `/about` | About TRISCRIPT |

## Reusing the `<ScanLetter />` component

```tsx
import { ScanLetter } from "@/components/ScanLetter";

<ScanLetter onConfirm={(values) => saveToMySystem(values)} />
```

`onConfirm` is called only after the person ticks the confirmation checkbox and presses Save. `values` is a `FieldValues` object with `subject`, `myNumber`, `yourNumber`, `date`, `from`, `to`, `signedBy`, `language`, `body` — all strings, empty when not read with sufficient confidence.

---

## Production deployment

1. Deploy the Go backend and the Next.js frontend separately.
2. Set `GO_API_URL` in the Next.js server environment to the Go backend's internal URL.
3. Set `NEXT_PUBLIC_PUBLIC_URL` to the public HTTPS URL of the Next.js frontend.
4. Serve over **HTTPS** in production. The phone's camera requires a secure context on non-localhost origins.
5. Add rate limiting on `POST /api/session` to prevent session flooding.
6. Add CORS headers on the Go backend only if you need cross-origin access (not required in the default setup where Next.js proxies everything).

### Multi-instance note

In-memory sessions are **not shared between separate Go processes** and are **lost when the Go server restarts**. For multi-instance production deployment:

- Use a shared session store (e.g., Redis with a TTL), or
- Route all session requests to a single Go instance (sticky sessions / session affinity).

Photo bytes are also in memory — each Go instance only has the photos for the sessions it created.

---

## Known limitations

- Session and photo data are in memory only. A Go restart loses all active sessions.
- No rate limiting is implemented on the session creation endpoint.
- The race detector (`go test -race`) requires CGO (GCC). On Windows without a GCC toolchain, the data-race flag is unavailable. The code is written to be concurrency-safe by design (all session mutations are behind a `sync.RWMutex` and `GetSession` returns a safe snapshot rather than a mutable pointer).
- Automatic LAN IP detection may pick the wrong interface on machines with multiple network adapters. Use `NEXT_PUBLIC_PUBLIC_URL` to set the address explicitly.
- The demo reader simulates a 1.4-second delay and returns invented test values. It never reads your photo.

---

## Git and contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Do not commit `.env.local`, secrets, or test images containing personal information.

---

## Licence

[Mozilla Public License 2.0](LICENSE).

---

*Built in the open by the Eastern Province IT Volunteer Programme, Sri Lanka.*
