<<<<<<< HEAD
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
=======
# TRISCRIPT

**TRISCRIPT is an open-source library that turns a phone photo of a letter or form into filled-in fields on a computer, in Sinhala, Tamil and English.**

Scan a QR code on your laptop, photograph the paper with your phone, and the details appear on the laptop: no typing, no app to install.

> **Status:** starting. Built in the open by the Eastern Province IT Volunteer Programme, Sri Lanka.

---

## Why

Government offices receive letters and paper forms every day. Someone reads each one and types its details into a system by hand: the subject, the reference numbers, the date, who sent it and who it is for. It is slow, it repeats work, and mistakes creep in, especially when the paper is in Sinhala, Tamil or English and the person typing reads only one or two of them.

TRISCRIPT removes that typing.

## Why the name

The Rosetta Stone carries one text in three scripts, and it unlocked how to read them. TRISCRIPT ("three scripts") reads letters and forms written in the three languages of Sri Lanka, and turns them into information any system can use.

## How it works for the person using it

1. On the computer, open the page where the letter or form is being entered. A **QR code** appears.
2. **Scan the QR code with a phone.** The phone's camera opens in the browser. Nothing to install.
3. **Photograph the letter or form.** Check the picture, retake it if needed.
4. The details **fill in on the computer** within moments. The person checks them, corrects anything, and saves.

The phone and the computer only talk to each other for that one letter, and the link expires.

## What it reads

**Letters (first):**

| Field | Example |
|---|---|
| Subject | the heading of the letter |
| My number and your number | the reference numbers |
| Date | the date written on the letter |
| From | the sender: person, post and office |
| To | the addressee |
| Signed by | the signatory and their post |
| Language | Sinhala, Tamil or English |
| Body | the full text, for search |

**Forms (second):** common paper forms such as leave applications and requisitions: each field on the form read into the matching field on the computer, using a description of the form's layout that any office can add.

## Languages

- **Sinhala, Tamil and English from the first release**, including letters that mix them.
- **Built to grow:** adding another language or script, or a new kind of form, must not require changing the core. Each language and each form type is an add-on.
- The screens people see are themselves available in all three languages.

## What it must do

**Must (first release)**
- Pair a phone and a computer with a QR code that expires.
- Capture a clear photo in the phone's browser, with a chance to retake.
- Read the letter fields above in Sinhala, Tamil and English.
- Show every value for the person to check and correct; never save without a person confirming.
- Say how sure it is about each field, and leave a field empty rather than guess.
- Work on ordinary phones and on weak connections.
- Be usable by anyone: large text, screen readers, clear contrast.

**Should**
- Several pages of one letter in one go.
- Common paper forms (leave, requisition), each described once and reused.
- Straighten, crop and sharpen a skewed photo automatically.

**Later**
- Handwriting.
- More languages and more form types, added by others.

## Built to be reused

TRISCRIPT is a **library**, so any system can add "scan a letter" to its own screens, plus a small **demo** that shows it working end to end. Its first home will be the Eastern Province's office letters system; any other office, in any country, is welcome to use it.

## Privacy and test data

- **Only test letters and forms are used in this project**: invented content, marked "TEST LETTER, NOT VALID", with reference numbers starting `TEST/`. Real letters, real names, real numbers and official letterheads or seals are never added to this repository.
- Photos are used only to read the fields and are not kept after the person saves.
- Nothing is sent anywhere except between the person's own phone and computer and the system they are using.

## Milestones

| Milestone | What is shown at the Friday demo |
|---|---|
| 1. Pair and capture | QR on the computer, camera on the phone, the photo arrives on the computer |
| 2. Read | Text read from a test letter in all three languages |
| 3. Fill | Letter fields filled in, checked and corrected by a person |
| 4. Reuse | The library added to a second page or system; first form type; documentation |

## Contributing

Everyone is welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Pick an issue labelled `good first issue`, discuss your plan in the issue, then open a pull request. Every change is reviewed before it is merged.

## Licence

[Mozilla Public License 2.0](LICENSE).

---

*TRISCRIPT is built by the Eastern Province IT Volunteer Programme, Sri Lanka.*
>>>>>>> origin/capture-pairing
