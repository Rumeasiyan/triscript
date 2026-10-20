/**
 * Tesseract OCR reader — free, runs entirely on the server, no API key needed.
 *
 * Uses tesseract.js with eng+sin+tam language packs.
 * Writes the image to a temp file first — tesseract.js is most reliable
 * with file paths rather than raw buffers in Next.js API routes.
 */

import { createWorker } from "tesseract.js";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { FieldKey, ReadFields } from "./types";
import { emptyFields, MIN_CONFIDENCE } from "./types";

export async function readWithTesseract(imageBuffer: Buffer): Promise<ReadFields> {
  // Write to a temp file
  const tmpPath = join(tmpdir(), `triscript-${Date.now()}.jpg`);
  writeFileSync(tmpPath, imageBuffer);

  try {
    const worker = await createWorker(["eng", "sin", "tam"], 1, {
      logger: () => {},
      errorHandler: () => {},
    });

    let text = "";
    try {
      const { data } = await worker.recognize(tmpPath);
      text = data.text ?? "";
    } finally {
      await worker.terminate();
    }

    return extractFields(text);
  } finally {
    // Always clean up temp file
    if (existsSync(tmpPath)) unlinkSync(tmpPath);
  }
}

// ─── Field extraction ─────────────────────────────────────────────────────────

function extractFields(raw: string): ReadFields {
  const out = emptyFields();
  if (!raw.trim()) return out;

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // ── Date ──────────────────────────────────────────────────────────────────
  const datePatterns = [
    /\b(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})\b/,
    /\b(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{4})\b/,
    /\b(\d{1,2}\s+\w+\s+\d{4})\b/i,
  ];
  for (const pat of datePatterns) {
    const m = raw.match(pat);
    if (m) { out.date = { value: m[1].trim(), confidence: 0.80 }; break; }
  }

  // ── Reference numbers ─────────────────────────────────────────────────────
  // Pattern: letters/numbers with slashes e.g. DS/EST/2026/014
  const refPattern = /\b([A-Z]{1,6}\/[A-Z0-9\/\-]{3,}\/\d{4}\/\d+)\b/g;
  const refs = [...raw.matchAll(refPattern)].map((m) => m[1]);
  if (refs[0]) out.myNumber = { value: refs[0], confidence: 0.78 };
  if (refs[1]) out.yourNumber = { value: refs[1], confidence: 0.72 };

  // Explicit "My No." / "Your No." labels
  const myMatch = raw.match(/(?:my\s*n[o0]|ref(?:erence)?\s*n[o0])\.?\s*[:–\-]?\s*([A-Za-z0-9\/\-\.]+)/i);
  if (myMatch) out.myNumber = { value: myMatch[1].trim(), confidence: 0.82 };

  const yourMatch = raw.match(/(?:your\s*n[o0])\.?\s*[:–\-]?\s*([A-Za-z0-9\/\-\.]+)/i);
  if (yourMatch) out.yourNumber = { value: yourMatch[1].trim(), confidence: 0.78 };

  // ── Subject ───────────────────────────────────────────────────────────────
  const subjectMatch = raw.match(/(?:subject|re|sub)\s*[:–\-]\s*(.{5,80})/i);
  if (subjectMatch) {
    out.subject = { value: subjectMatch[1].trim(), confidence: 0.82 };
  } else {
    // Heuristic: a line with 10+ chars that isn't a ref/date/address
    const candidate = lines.find(
      (l) => l.length >= 10 && !/^\d/.test(l) && !/^[A-Z]{1,5}\//.test(l),
    );
    if (candidate) out.subject = { value: candidate, confidence: 0.52 };
  }

  // ── From / To ─────────────────────────────────────────────────────────────
  const fromMatch = raw.match(/(?:^|\n)\s*from\s*[:–\-]\s*(.+)/im);
  if (fromMatch) out.from = { value: fromMatch[1].trim(), confidence: 0.74 };

  const toMatch = raw.match(/(?:^|\n)\s*to\s*[:–\-,]\s*(.+)/im);
  if (toMatch) out.to = { value: toMatch[1].trim(), confidence: 0.74 };

  // ── Signed by ─────────────────────────────────────────────────────────────
  const signedMatch = raw.match(/(?:signed|signature)\s*[:–\-]?\s*(.+)/i);
  if (signedMatch) {
    out.signedBy = { value: signedMatch[1].trim(), confidence: 0.70 };
  } else {
    // Last 2-3 non-empty lines often contain signatory
    const tail = lines.slice(-5).filter((l) => l.length > 3).slice(0, 2);
    if (tail.length) out.signedBy = { value: tail.join(", "), confidence: 0.48 };
  }

  // ── Language ──────────────────────────────────────────────────────────────
  out.language = { value: detectLanguage(raw), confidence: 0.88 };

  // ── Body — the full raw text is always useful for search ──────────────────
  if (raw.trim().length > 30) {
    out.body = { value: raw.trim(), confidence: 0.72 };
  }

  // Clear values below MIN_CONFIDENCE
  for (const key of Object.keys(out) as FieldKey[]) {
    if (out[key].confidence < MIN_CONFIDENCE) {
      out[key] = { value: "", confidence: out[key].confidence };
    }
  }

  return out;
}

// ─── Language detection ───────────────────────────────────────────────────────

function detectLanguage(text: string): "si" | "ta" | "en" | "mixed" {
  const hasSinhala = /[\u0D80-\u0DFF]/.test(text);
  const hasTamil   = /[\u0B80-\u0BFF]/.test(text);
  const hasEnglish = /[A-Za-z]{3,}/.test(text);
  const count = (hasSinhala ? 1 : 0) + (hasTamil ? 1 : 0) + (hasEnglish ? 1 : 0);
  if (count > 1) return "mixed";
  if (hasSinhala) return "si";
  if (hasTamil)   return "ta";
  return "en";
}
