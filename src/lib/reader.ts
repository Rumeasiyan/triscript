import {
  FIELD_KEYS,
  MIN_CONFIDENCE,
  emptyFields,
  type FieldKey,
  type ReadFields,
  type ReadResult,
} from "./types";
import type { Lang } from "./i18n";

/**
 * Reader adapter.
 *
 * The front end does not do OCR itself. It hands the photo to a "reader":
 *  - If NEXT_PUBLIC_TRISCRIPT_READER_URL is set, the photo is POSTed there
 *    (multipart form: "image", "uiLang") and the JSON reply is used.
 *  - Otherwise a DEMO reader returns invented TEST letter values, so the whole
 *    flow can be shown end to end before the real reader exists.
 *
 * Either way, any value below MIN_CONFIDENCE is cleared: leave a field empty
 * rather than guess.
 */

const READER_URL = process.env.NEXT_PUBLIC_TRISCRIPT_READER_URL;

export async function readLetter(image: Blob, uiLang: Lang): Promise<ReadResult> {
  if (READER_URL) {
    const body = new FormData();
    body.append("image", image, "letter.jpg");
    body.append("uiLang", uiLang);
    const res = await fetch(READER_URL, { method: "POST", body });
    if (!res.ok) throw new Error(`Reader replied ${res.status}`);
    const json = (await res.json()) as { fields?: Partial<Record<FieldKey, unknown>> };
    return { fields: normalise(json.fields), demo: false };
  }
  await new Promise((r) => setTimeout(r, 1400));
  return { fields: normalise(DEMO_FIELDS), demo: true };
}

function normalise(raw: Partial<Record<FieldKey, unknown>> | undefined): ReadFields {
  const out = emptyFields();
  if (!raw) return out;
  for (const key of FIELD_KEYS) {
    const item = raw[key] as { value?: unknown; confidence?: unknown } | undefined;
    const value = typeof item?.value === "string" ? item.value : "";
    const c = Number(item?.confidence);
    const confidence = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0;
    out[key] =
      confidence < MIN_CONFIDENCE ? { value: "", confidence } : { value, confidence };
  }
  return out;
}

// Invented content only. Marked as a test letter, reference numbers start TEST/.
const DEMO_FIELDS: Record<FieldKey, { value: string; confidence: number }> = {
  subject: { value: "TEST LETTER, NOT VALID: Request for training room", confidence: 0.96 },
  myNumber: { value: "TEST/ITV/2026/014", confidence: 0.93 },
  yourNumber: { value: "TEST/DS/2026/221", confidence: 0.71 },
  date: { value: "2026-10-05", confidence: 0.9 },
  from: { value: "Coordinator, IT Volunteer Programme (TEST OFFICE)", confidence: 0.88 },
  to: { value: "Divisional Secretary (TEST OFFICE)", confidence: 0.82 },
  signedBy: { value: "A. Test Person, Coordinator", confidence: 0.38 },
  language: { value: "en", confidence: 0.97 },
  body: {
    value:
      "TEST LETTER, NOT VALID.\nThis is invented text used to show the scan flow. Please arrange a training room for the volunteers on Friday.",
    confidence: 0.84,
  },
};
