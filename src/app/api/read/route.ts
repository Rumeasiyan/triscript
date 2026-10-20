import { NextResponse } from "next/server";
import { type FieldKey, FIELD_KEYS, MIN_CONFIDENCE, emptyFields } from "@/lib/types";
import { readWithTesseract } from "@/lib/tesseractReader";

export const dynamic = "force-dynamic";
// Allow up to 7 MB for multipart (image + fields)
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/read
 *
 * Accepts multipart/form-data with:
 *   image   – JPEG / PNG / WebP, max 6 MB
 *   uiLang  – "en" | "si" | "ta"
 *
 * Returns JSON:
 *   { fields: Record<FieldKey, { value: string; confidence: number }> }
 *
 * If OPENAI_API_KEY is set, sends the image to GPT-4o vision and parses the
 * reply.  Otherwise returns the built-in DEMO values so the whole flow works
 * without any external service.
 *
 * If TRISCRIPT_API_KEY is set, requests must include the header:
 *   X-Triscript-Key: <value>
 * This is useful when the reader endpoint is exposed to other apps.
 */
export async function POST(req: Request) {
  const requiredKey = process.env.TRISCRIPT_API_KEY;
  if (requiredKey) {
    const provided = req.headers.get("x-triscript-key");
    if (!provided || provided !== requiredKey) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
    }
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400, headers: NO_STORE });
  }

  const imageFile = formData.get("image");
  const uiLang = (formData.get("uiLang") as string | null) ?? "en";

  if (!(imageFile instanceof Blob)) {
    return NextResponse.json({ error: "missing-image" }, { status: 400, headers: NO_STORE });
  }

  const contentType = imageFile.type || "image/jpeg";
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(contentType)) {
    return NextResponse.json({ error: "bad-type" }, { status: 415, headers: NO_STORE });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    try {
      const fields = await readWithOpenAI(imageFile, uiLang, apiKey);
      return NextResponse.json({ fields }, { headers: NO_STORE });
    } catch (err) {
      console.error("[read] OpenAI error:", err);
      return NextResponse.json({ error: "reader-error" }, { status: 502, headers: NO_STORE });
    }
  }

  // No OpenAI key → try Tesseract OCR (free, runs locally)
  try {
    const buffer = Buffer.from(await imageFile.arrayBuffer());
    const fields = await readWithTesseract(buffer);
    // Check if Tesseract extracted anything useful
    const hasContent = Object.values(fields).some((f) => f.value.trim().length > 0);
    if (hasContent) {
      return NextResponse.json({ fields }, { headers: NO_STORE });
    }
  } catch (err) {
    console.error("[read] Tesseract error:", err);
    // Fall through to demo
  }

  // Nothing worked → return demo values
  await new Promise((r) => setTimeout(r, 600));
  return NextResponse.json({ fields: DEMO_FIELDS }, { headers: NO_STORE });
}

// ─── OpenAI Vision ──────────────────────────────────────────────────────────

async function readWithOpenAI(
  image: Blob,
  uiLang: string,
  apiKey: string,
): Promise<ReturnType<typeof normalisedFields>> {
  // Convert to base64 data URL
  const arrayBuffer = await image.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = image.type || "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const prompt = buildPrompt(uiLang);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 1024,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI ${response.status}: ${body}`);
  }

  const json = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const text = json.choices[0]?.message?.content ?? "";
  return parseOpenAIResponse(text);
}

function buildPrompt(uiLang: string): string {
  return `You are reading a Sri Lankan government office letter or form. \
The letter may be in Sinhala, Tamil, English, or a mix. \
Extract the following fields and return ONLY a JSON object — no markdown, no explanation.

Fields to extract:
- subject: The subject/heading of the letter
- myNumber: The sender's reference number (often labelled "My No.", "ΦφΟ", etc.)
- yourNumber: The recipient's reference number (often labelled "Your No.", etc.)
- date: The date on the letter in YYYY-MM-DD format if possible, otherwise as written
- from: The sender's name, post and office
- to: The recipient's name, post and office  
- signedBy: The name and post of the signatory
- language: Primary language of the letter — one of: "si", "ta", "en", "mixed"
- body: The full text body of the letter (for search purposes)

For each field return an object with:
  "value": the extracted text (empty string if not found or not sure)
  "confidence": a number between 0 and 1 indicating how confident you are

If you cannot read a field clearly, return confidence < 0.5 and the value as "".

UI language hint (for date parsing preference): ${uiLang}

Return format (JSON only):
{
  "subject": { "value": "...", "confidence": 0.0 },
  "myNumber": { "value": "...", "confidence": 0.0 },
  "yourNumber": { "value": "...", "confidence": 0.0 },
  "date": { "value": "...", "confidence": 0.0 },
  "from": { "value": "...", "confidence": 0.0 },
  "to": { "value": "...", "confidence": 0.0 },
  "signedBy": { "value": "...", "confidence": 0.0 },
  "language": { "value": "...", "confidence": 0.0 },
  "body": { "value": "...", "confidence": 0.0 }
}`;
}

function parseOpenAIResponse(
  text: string,
): Record<FieldKey, { value: string; confidence: number }> {
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    const raw = JSON.parse(cleaned) as Partial<Record<FieldKey, unknown>>;
    return normalisedFields(raw);
  } catch {
    // Return empty result — the person will type in the values
    return normalisedFields({});
  }
}

function normalisedFields(
  raw: Partial<Record<FieldKey, unknown>>,
): Record<FieldKey, { value: string; confidence: number }> {
  const out = emptyFields() as unknown as Record<FieldKey, { value: string; confidence: number }>;
  for (const key of FIELD_KEYS) {
    const item = raw[key] as { value?: unknown; confidence?: unknown } | undefined;
    const value = typeof item?.value === "string" ? item.value.trim() : "";
    const c = Number(item?.confidence);
    const confidence = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0;
    // Clear values below MIN_CONFIDENCE — leave field empty rather than guess
    out[key] =
      confidence < MIN_CONFIDENCE ? { value: "", confidence } : { value, confidence };
  }
  return out;
}

// ─── Demo fallback ───────────────────────────────────────────────────────────

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
