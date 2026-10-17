import { NextResponse } from "next/server";
import { getFormType, type FormValues, type FormReadResult, FORM_TYPES } from "@/lib/forms";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/read/form
 *
 * Accepts multipart/form-data with:
 *   image    – JPEG / PNG / WebP, max 6 MB
 *   formId   – one of the registered form type IDs (see src/lib/forms.ts)
 *   uiLang   – "en" | "si" | "ta"
 *
 * Returns JSON: FormReadResult
 *   { formId, values: Record<string, string>, confidences: Record<string, number>, demo: boolean }
 *
 * Uses OpenAI GPT-4o if OPENAI_API_KEY is set, otherwise returns demo data.
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
  const formId = formData.get("formId") as string | null;

  if (!(imageFile instanceof Blob)) {
    return NextResponse.json({ error: "missing-image" }, { status: 400, headers: NO_STORE });
  }

  if (!formId) {
    return NextResponse.json(
      { error: "missing-formId", available: Object.keys(FORM_TYPES) },
      { status: 400, headers: NO_STORE },
    );
  }

  const formType = getFormType(formId);
  if (!formType) {
    return NextResponse.json(
      { error: "unknown-formId", available: Object.keys(FORM_TYPES) },
      { status: 400, headers: NO_STORE },
    );
  }

  const contentType = imageFile.type || "image/jpeg";
  if (!/^image\/(jpeg|png|webp)$/.test(contentType)) {
    return NextResponse.json({ error: "bad-type" }, { status: 415, headers: NO_STORE });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const result = await readFormWithOpenAI(imageFile, formType, apiKey);
      return NextResponse.json(result, { headers: NO_STORE });
    } catch (err) {
      console.error("[read/form] OpenAI error:", err);
      return NextResponse.json({ error: "reader-error" }, { status: 502, headers: NO_STORE });
    }
  }

  // Demo fallback
  await new Promise((r) => setTimeout(r, 600));
  const demoResult: FormReadResult = {
    formId,
    values: makeDemoValues(formType.id),
    confidences: Object.fromEntries(
      formType.fields.map((f) => [f.key, 0.88]),
    ),
    demo: true,
  };
  return NextResponse.json(demoResult, { headers: NO_STORE });
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────

import { type FormType } from "@/lib/forms";

async function readFormWithOpenAI(
  image: Blob,
  formType: FormType,
  apiKey: string,
): Promise<FormReadResult> {
  const arrayBuffer = await image.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const dataUrl = `data:${image.type || "image/jpeg"};base64,${base64}`;

  const fieldList = formType.fields
    .map((f) => `- "${f.key}": ${f.label} — ${f.hint}`)
    .join("\n");

  const prompt = `You are reading a Sri Lankan government paper form: "${formType.name}".

${formType.description}

Extract the following fields and return ONLY a JSON object — no markdown, no explanation.

Fields to extract:
${fieldList}

For each field return:
  "value": the extracted text (empty string if not found or unsure)
  "confidence": number 0–1 (use < 0.5 if not clearly readable)

Return JSON format:
{
${formType.fields.map((f) => `  "${f.key}": { "value": "...", "confidence": 0.0 }`).join(",\n")}
}`;

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
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  let raw: Record<string, { value?: unknown; confidence?: unknown }> = {};
  try {
    raw = JSON.parse(cleaned) as typeof raw;
  } catch {
    /* empty result */
  }

  const values: FormValues = {};
  const confidences: Record<string, number> = {};
  const MIN_C = 0.5;

  for (const field of formType.fields) {
    const item = raw[field.key];
    const value = typeof item?.value === "string" ? item.value.trim() : "";
    const c = Number(item?.confidence);
    const confidence = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0;
    values[field.key] = confidence < MIN_C ? "" : value;
    confidences[field.key] = confidence;
  }

  return { formId: formType.id, values, confidences, demo: false };
}

// ─── Demo fallbacks ───────────────────────────────────────────────────────────

function makeDemoValues(formId: string): FormValues {
  if (formId === "leave-application") {
    return {
      applicantName: "T. Test Person",
      post: "Assistant Director (TEST)",
      department: "TEST DEPARTMENT, Eastern Province",
      leaveType: "Annual",
      fromDate: "2026-10-20",
      toDate: "2026-10-22",
      days: "3",
      reason: "TEST LEAVE APPLICATION, NOT VALID. Personal reasons.",
      signedDate: "2026-10-17",
    };
  }
  if (formId === "requisition") {
    return {
      department: "TEST DEPARTMENT, Eastern Province",
      requestedBy: "T. Test Person, Assistant Director",
      date: "2026-10-17",
      referenceNumber: "TEST/REQ/2026/042",
      items: "A4 paper — 10 reams\nBallpoint pens — 20 nos.\nStaples — 5 boxes",
      purpose: "TEST REQUISITION, NOT VALID. Office supplies for volunteers.",
      approvedBy: "",
    };
  }
  return {};
}
