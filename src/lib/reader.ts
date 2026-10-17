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
 * Reader adapter — client side.
 *
 * Sends the photo to /api/read (a server-side route that calls OpenAI Vision
 * when OPENAI_API_KEY is set, or returns demo data otherwise).
 *
 * Legacy: if NEXT_PUBLIC_TRISCRIPT_READER_URL is set, the photo is POSTed
 * directly to that external service instead (for custom reader deployments).
 *
 * Either way, values below MIN_CONFIDENCE are cleared: leave a field empty
 * rather than guess.
 */

const EXTERNAL_READER_URL = process.env.NEXT_PUBLIC_TRISCRIPT_READER_URL;

export async function readLetter(image: Blob, uiLang: Lang): Promise<ReadResult> {
  if (EXTERNAL_READER_URL) {
    // Direct external reader (custom deployment)
    const body = new FormData();
    body.append("image", image, "letter.jpg");
    body.append("uiLang", uiLang);
    const res = await fetch(EXTERNAL_READER_URL, { method: "POST", body });
    if (!res.ok) throw new Error(`Reader replied ${res.status}`);
    const json = (await res.json()) as { fields?: Partial<Record<FieldKey, unknown>> };
    return { fields: normalise(json.fields), demo: false };
  }

  // Server-side reader route (handles OpenAI key securely on the server)
  const body = new FormData();
  body.append("image", image, "letter.jpg");
  body.append("uiLang", uiLang);
  const res = await fetch("/api/read", { method: "POST", body, cache: "no-store" });
  if (!res.ok) throw new Error(`Reader replied ${res.status}`);
  const json = (await res.json()) as { fields?: Partial<Record<FieldKey, unknown>> };

  // The server marks demo responses by returning the known demo subject value
  const subject = (json.fields?.subject as { value?: string } | undefined)?.value ?? "";
  const isDemo = subject.startsWith("TEST LETTER, NOT VALID");

  return { fields: normalise(json.fields), demo: isDemo };
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
