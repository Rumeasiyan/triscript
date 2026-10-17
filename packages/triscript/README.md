# triscript

Turn a phone photo of a letter into filled-in fields — in Sinhala, Tamil and English.

## What it does

Scan a QR code on your laptop, photograph the paper with your phone, and the details appear on the laptop: no typing, no app to install.

## Install

```sh
npm install triscript
```

## Usage

### 1. Mount the API routes

In your Next.js app, create the following API routes by copying them from the [TRISCRIPT web app](https://github.com/eastprovince-itvp/triscript):

- `app/api/session/route.ts` — create a pairing session
- `app/api/session/[id]/route.ts` — poll / delete a session
- `app/api/session/[id]/photo/route.ts` — phone uploads the photo
- `app/api/read/route.ts` — server-side letter reader

### 2. Set environment variables

```sh
# Optional: enables real OCR via GPT-4o Vision
OPENAI_API_KEY=sk-...

# Optional: address the phone can reach your app on
NEXT_PUBLIC_PUBLIC_URL=http://192.168.1.20:3000

# Optional: custom reader service URL
NEXT_PUBLIC_TRISCRIPT_READER_URL=
```

### 3. Add `<ScanLetter>` to any page

```tsx
"use client";
import { ScanLetter } from "@/components/ScanLetter"; // copy from triscript web app

export default function MyPage() {
  return (
    <ScanLetter
      onConfirm={(values) => {
        // values is FieldValues — all nine letter fields
        console.log(values.subject, values.date, values.from);
      }}
    />
  );
}
```

The component handles everything: showing the QR code, polling for the photo, calling the reader, showing the review form, and calling `onConfirm` only after the person checks and saves.

## Fields returned

| Key | Example |
|---|---|
| `subject` | the heading of the letter |
| `myNumber` | sender's reference number |
| `yourNumber` | recipient's reference number |
| `date` | date in YYYY-MM-DD format |
| `from` | sender: person, post and office |
| `to` | addressee |
| `signedBy` | signatory and their post |
| `language` | `"si"` / `"ta"` / `"en"` / `"mixed"` |
| `body` | full text, for search |

## Types

```ts
import type { FieldValues, ReadResult, FieldKey } from "triscript";
```

## Privacy

Photos are used only to read the fields. The server deletes the photo when the person saves or when the session expires. Nothing is stored beyond the TTL.

## Licence

MIT — Eastern Province IT Volunteer Programme, Sri Lanka.
