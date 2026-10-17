# TRISCRIPT

**An open-source library that turns a phone photo of a letter or form into filled-in fields on a computer, in Sinhala, Tamil and English.**

Scan a QR code on your laptop, photograph the paper with your phone, and the details appear on the laptop: no typing, no app to install.

> **Status:** starting. Built in the open by the Eastern Province IT Volunteer Programme, Sri Lanka.

---

## Quick start

```sh
npm install
cp .env.example .env.local
# Edit .env.local — add OPENAI_API_KEY for real OCR, or leave empty for demo mode
npm run dev
```

Open **http://localhost:3000/demo** on the computer.

For the phone to reach the QR code link, set `NEXT_PUBLIC_PUBLIC_URL` in `.env.local` to your computer's local address (e.g. `http://192.168.1.20:3000`). The phone and computer must be on the same network.

## Pages

| Route | What it is |
|---|---|
| `/` | Introduction: how it works, languages, privacy |
| `/demo` | Scan a letter end to end (QR → capture → read → check → save) |
| `/register` | A second page that reuses `<ScanLetter />` (milestone 4: Reuse) |
| `/capture/[sessionId]` | The phone page opened by the QR code |
| `/about` | About the project |

## Reusing the component

```tsx
import { ScanLetter } from "@/components/ScanLetter";

<ScanLetter onConfirm={(values) => saveToMySystem(values)} />
```

`onConfirm` is called only after the person ticks "I have checked these details" and presses Save. `values` contains `subject`, `myNumber`, `yourNumber`, `date`, `from`, `to`, `signedBy`, `language`, `body` (all strings, empty when not read).

## The reader — OCR

`src/lib/reader.ts` is the single place where a photo becomes field values. The server-side route at `/api/read` does the actual OCR call.

**Options, in priority order:**

1. **`NEXT_PUBLIC_TRISCRIPT_READER_URL`** — custom external reader service. POST multipart (`image`, `uiLang`), expect `{ fields: { subject: { value, confidence }, … } }`.
2. **`OPENAI_API_KEY`** — uses GPT-4o Vision server-side. The key stays on the server and is never exposed to the browser.
3. **Demo mode** (no keys set) — returns invented TEST letter values. Shows milestones 1, 3 and 4 without any external service.

Any value with confidence below 0.5 is cleared before display — leave a field empty rather than guess.

## What it reads

| Field | Example |
|---|---|
| Subject | the heading of the letter |
| My number / Your number | the reference numbers |
| Date | the date written on the letter |
| From | the sender: person, post and office |
| To | the addressee |
| Signed by | the signatory and their post |
| Language | Sinhala, Tamil or English |
| Body | the full text, for search |

## How it meets the requirements

| Requirement | Where |
|---|---|
| Pair with an expiring QR code | `ScanLetter.tsx`, `lib/store.ts` (`SESSION_TTL_SECONDS`) |
| Clear photo with a chance to retake | `capture/[sessionId]/page.tsx` (preview + Retake) |
| Read fields in Sinhala, Tamil, English | `/api/read` route (OpenAI Vision or demo) |
| Person checks and confirms; never auto-save | `ReviewForm.tsx` (confirm checkbox required) |
| Confidence per field; empty rather than guess | `ConfidenceBadge`, `MIN_CONFIDENCE` in `lib/types.ts` |
| Ordinary phones, weak connections | Client-side shrink (`lib/image.ts`), upload retries, polling tolerates drops |
| Accessible to everyone | Large text, 44px targets, visible focus, labelled fields, live regions, reduced motion, light+dark |
| Screens in all three languages | `lib/i18n.ts` |
| Rate limiting on session creation | `lib/rateLimit.ts`, `/api/session` route |

## Adding a language

1. Add the code to `Lang` and `LANGS` in `src/lib/i18n.ts`.
2. Add a dictionary typed as `Dict` and register it in `DICTS`. TypeScript lists every missing key.

The core does not change.

## Privacy

- Sessions and photos live only in server memory (`lib/store.ts`), expire after `SESSION_TTL_SECONDS` (default 300), and are deleted when the person saves, cancels or leaves.
- The phone page keeps nothing after sending.
- Nothing is sent anywhere except between the phone, the computer and the reader service you configure.

## Production notes

- The in-memory store suits a single server instance. For multiple instances, swap `lib/store.ts` for a shared store with a TTL (e.g. Redis) keeping the same interface.
- Serve over HTTPS in production so the phone camera is available.
- Rate limiting on `/api/session` is built in (20 requests per IP per minute). Adjust in `lib/rateLimit.ts`.
- Not yet built (from "Should"): multi-page letters, form types, automatic straighten/crop, handwriting.

## Milestones

| Milestone | What is shown |
|---|---|
| 1. Pair and capture | QR on the computer, camera on the phone, the photo arrives |
| 2. Read | Text read from a test letter in all three languages |
| 3. Fill | Letter fields filled in, checked and corrected by a person |
| 4. Reuse | The library added to a second page; documentation |

## Contributing

Everyone is welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Pick an issue labelled `good first issue`, discuss in the issue, then open a pull request.

## Privacy and test data

Only invented test letters are used in this project: marked "TEST LETTER, NOT VALID", with reference numbers starting `TEST/`. Real letters, names, numbers, letterheads or seals are never added to this repository.

## Licence

[Mozilla Public License 2.0](LICENSE).

---

*Built by the Eastern Province IT Volunteer Programme, Sri Lanka.*
