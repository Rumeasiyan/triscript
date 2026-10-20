import { NextResponse } from "next/server";
import { type FieldKey, FIELD_KEYS, MIN_CONFIDENCE, emptyFields } from "@/lib/types";
import { readWithTesseract, isTesseractAvailable } from "@/lib/tesseractReader";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  // Optional API key protection
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

  // Accept any image type — phones sometimes send empty or generic content-type
  const rawType = imageFile.type ?? "";
  const isImage = rawType.startsWith("image/") || rawType === "" || rawType === "application/octet-stream";
  if (!isImage) {
    console.error("[read] Rejected content-type:", rawType);
    return NextResponse.json({ error: "bad-type" }, { status: 415, headers: NO_STORE });
  }

  console.log("[read] image size:", imageFile.size, "type:", rawType, "lang:", uiLang);

  // ── OpenAI Vision ────────────────────────────────────────────────────────
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const fields = await readWithOpenAI(imageFile, uiLang, apiKey);
      return NextResponse.json({ fields }, { headers: NO_STORE });
    } catch (err) {
      console.error("[read] OpenAI error:", err);
      // Fall through to Tesseract
    }
  }

  // ── Tesseract OCR ────────────────────────────────────────────────────────
  try {
    const available = await isTesseractAvailable();
    console.log("[read] Tesseract available:", available);
    if (available) {
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      console.log("[read] Running Tesseract on buffer size:", buffer.length);
      const fields = await readWithTesseract(buffer);
      const hasContent = Object.values(fields).some((f) => f.value.trim().length > 0);
      console.log("[read] Tesseract hasContent:", hasContent);
      if (hasContent) {
        return NextResponse.json({ fields, demo: false }, { headers: NO_STORE });
      }
    }
  } catch (err) {
    console.error("[read] Tesseract error:", err);
  }

  // ── Demo fallback ────────────────────────────────────────────────────────
  console.log("[read] Falling back to demo data");
  await new Promise((r) => setTimeout(r, 600));
  return NextResponse.json({ fields: DEMO_FIELDS }, { headers: NO_STORE });
}

// ─── OpenAI Vision ───────────────────────────────────────────────────────────

async function readWithOpenAI(
  image: Blob,
  uiLang: string,
  apiKey: string,
): Promise<ReturnType<typeof normalisedFields>> {
  const arrayBuffer = await image.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = image.type || "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${base64}`;

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
            { type: "text", text: buildPrompt(uiLang) },
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

Fields:
- subject: heading of the letter
- myNumber: sender's reference number
- yourNumber: recipient's reference number
- date: date in YYYY-MM-DD format
- from: sender name, post and office
- to: recipient name and office
- signedBy: signatory name and post
- language: "si", "ta", "en", or "mixed"
- body: full text body

Each field: { "value": "...", "confidence": 0.0 }
UI language: ${uiLang}`;
}

function parseOpenAIResponse(
  text: string,
): Record<FieldKey, { value: string; confidence: number }> {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    const raw = JSON.parse(cleaned) as Partial<Record<FieldKey, unknown>>;
    return normalisedFields(raw);
  } catch {
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
    out[key] = confidence < MIN_CONFIDENCE ? { value: "", confidence } : { value, confidence };
  }
  return out;
}

// ─── Demo fallback ────────────────────────────────────────────────────────────

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
    value: "TEST LETTER, NOT VALID.\nThis is invented text used to show the scan flow.",
    confidence: 0.84,
  },
};
