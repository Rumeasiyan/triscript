# TRISCRIPT web (front end)

Next.js (App Router, TypeScript) front end for TRISCRIPT: photograph a letter with your phone, see the details filled in on your computer, in Sinhala, Tamil and English.

> Only invented test letters are used. Mark them "TEST LETTER, NOT VALID", with reference numbers starting `TEST/`. Never add real letters, names, numbers, letterheads or seals.

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000/demo on the computer.

For the phone to open the QR code link, it must reach the computer, for example on the same Wi-Fi. Set `NEXT_PUBLIC_PUBLIC_URL` in `.env.local` to the computer's address (such as `http://192.168.1.20:3000`) and restart. The camera opens through the browser's file picker (`capture="environment"`), so plain `http` on a local network works.

## Pages

| Route | What it is |
| --- | --- |
| `/` | Introduction: how it works, languages, privacy |
| `/demo` | Scan a letter end to end (QR, capture, read, check, save) |
| `/register` | A second page that reuses `<ScanLetter />` (milestone 4: Reuse) |
| `/capture/[sessionId]` | The phone page opened by the QR code |

## Reusing the component

```tsx
import { ScanLetter } from "@/components/ScanLetter";

<ScanLetter onConfirm={(values) => saveToMySystem(values)} />
```

`onConfirm` is called only after the person ticks "I have checked these details" and presses Save. `values` has `subject`, `myNumber`, `yourNumber`, `date`, `from`, `to`, `signedBy`, `language`, `body` (all strings, empty when not read).

## How it meets the "must" list

| Must | Where |
| --- | --- |
| Pair with an expiring QR code | `ScanLetter.tsx`, `lib/store.ts` (`SESSION_TTL_SECONDS`, default 300) |
| Clear photo with a chance to retake | `capture/[sessionId]/page.tsx` (preview, Retake) |
| Read the fields in three languages | `lib/reader.ts` adapter (see below) |
| Person checks and corrects; never save without confirming | `ReviewForm.tsx` (confirm box required) |
| Say how sure; leave empty rather than guess | `ConfidenceBadge`, `MIN_CONFIDENCE` in `lib/types.ts` |
| Ordinary phones, weak connections | Client-side shrink (`lib/image.ts`), upload retries, polling that tolerates drops |
| Usable by anyone | Large base text, 48px targets, visible focus, labelled fields, status not by colour alone, live regions, reduced motion, light and dark contrast |
| Screens in all three languages | `lib/i18n.ts` |

## The reader

The front end does not do OCR. `lib/reader.ts` is the single place where a photo becomes field values.

- With `NEXT_PUBLIC_TRISCRIPT_READER_URL` set, it POSTs multipart form data (`image`, `uiLang`) and expects `{ "fields": { "subject": { "value": "...", "confidence": 0.93 }, ... } }`.
- With it empty, a **demo reader** returns invented TEST values (the review screen says so). Use this to show milestones 1, 3 and 4 before the real reader exists.

Any value with confidence below 0.5 is cleared before display.

## Adding a language

1. Add the code to `Lang` and `LANGS` in `src/lib/i18n.ts`.
2. Add a dictionary typed as `Dict` and register it in `DICTS`. TypeScript lists every missing key.

The core does not change.

## Privacy

- Sessions and photos live only in server memory (`lib/store.ts`), expire on a timer, and are deleted when the person saves, cancels or leaves.
- The phone page keeps nothing after sending.
- Nothing is sent anywhere except between the phone, the computer and the reader URL you configure.

## Production notes

- The in-memory store suits one server instance. For several instances, swap `lib/store.ts` for a shared store with a TTL (for example Redis) keeping the same functions.
- Serve over HTTPS in production, and add rate limiting on `/api/session`.
- Not yet built (from "Should"/"Later"): several pages of one letter, form types, automatic straighten/crop, handwriting.
