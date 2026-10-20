/**
 * Tesseract OCR reader — free, runs entirely on the server, no API key needed.
 *
 * Strategy:
 *   1. Run Tesseract on the image with eng+sin+tam language data
 *   2. Get raw text
 *   3. Apply regex patterns to extract the known letter fields
 *   4. Return confidence scores based on how well the pattern matched
 *
 * Field extraction uses patterns common in Sri Lankan government letters.
 * Anything not matched is left empty — the review screen lets the person fill in.
 */

import { createWorker } from "tesseract.js";
import type { FieldKey, ReadFields } from "./types";
import { emptyFields, MIN_CONFIDENCE } from "./types";

export async function readWithTesseract(imageBuffer: Buffer): Promise<ReadFields> {
  const worker = await createWorker(["eng", "sin", "tam"], 1, {
    // Suppress verbose Tesseract logging
    logger: () => {},
    errorHandler: () => {},
  });

  try {
    const { data } = await worker.recognize(imageBuffer);
    const text = data.text ?? "";
    return extractFields(text);
  } finally {
    await worker.terminate();
  }
}

// ─── Field extraction ─────────────────────────────────────────────────────────

function extractFields(raw: string): ReadFields {
  const out = emptyFields();
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const full = raw;

  // ── Date ──────────────────────────────────────────────────────────────────
  // Matches: 2026-10-05 / 05.10.2026 / 05/10/2026 / 5th October 2026 / October 5, 2026
  const dateMatch =
    full.match(/\b(\d{4}[-\/]\d{2}[-\/]\d{2})\b/) ||
    full.match(/\b(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})\b/) ||
    full.match(/\b(\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4})\b/i) ||
    full.match(/\b(\w+\s+\d{1,2},?\s+\d{4})\b/);
  if (dateMatch) {
    out.date = { value: dateMatch[1].trim(), confidence: 0.82 };
  }

  // ── Reference numbers ─────────────────────────────────────────────────────
  // My No. / ෙමා.අ. / என் இல. — the sender's reference
  const myNumMatch =
    full.match(/(?:my\s*n[o0]\.?|ref(?:erence)?\s*n[o0]\.?|ෙමා\.?අ\.?|என்\s*இல\.?)\s*[:–-]?\s*([A-Za-z0-9\/\-\.]+)/i) ||
    full.match(/([A-Z]{2,}\/[A-Z0-9\/\-]+\/\d{4}\/\d+)/);
  if (myNumMatch) {
    out.myNumber = { value: myNumMatch[1].trim(), confidence: 0.78 };
  }

  // Your No. / ඔබේ.අ. / உங்கள் இல. — the recipient's reference
  const yourNumMatch = full.match(
    /(?:your\s*n[o0]\.?|ඔ(?:බේ)?\.?අ\.?|உங்கள்\s*இல\.?)\s*[:–-]?\s*([A-Za-z0-9\/\-\.]+)/i,
  );
  if (yourNumMatch) {
    out.yourNumber = { value: yourNumMatch[1].trim(), confidence: 0.75 };
  }

  // ── Subject ───────────────────────────────────────────────────────────────
  // "Subject:", "Re:", "විෂය:", "பொருள்:" — usually followed by the heading
  const subjectMatch = full.match(
    /(?:subject|re|විෂය|பொருள்)\s*[:–]\s*(.+)/i,
  );
  if (subjectMatch) {
    out.subject = { value: subjectMatch[1].trim(), confidence: 0.80 };
  } else {
    // Fallback: first non-empty line after reference/date block is often the subject
    const candidate = findSubjectCandidate(lines);
    if (candidate) {
      out.subject = { value: candidate, confidence: 0.55 };
    }
  }

  // ── From ──────────────────────────────────────────────────────────────────
  // "From:" or lines near the top before "To:"
  const fromMatch = full.match(/(?:from|aනු|இருந்து)\s*[:–]\s*(.+)/i);
  if (fromMatch) {
    out.from = { value: fromMatch[1].trim(), confidence: 0.72 };
  } else {
    // Heuristic: sender details are usually in the top-right block
    const fromBlock = extractAddressBlock(lines, "from");
    if (fromBlock) out.from = { value: fromBlock, confidence: 0.55 };
  }

  // ── To ────────────────────────────────────────────────────────────────────
  const toMatch = full.match(/(?:^|\n)(?:to|වෙත|அனுப்புநர்)\s*[:–,]\s*(.+)/im);
  if (toMatch) {
    out.to = { value: toMatch[1].trim(), confidence: 0.72 };
  } else {
    const toBlock = extractAddressBlock(lines, "to");
    if (toBlock) out.to = { value: toBlock, confidence: 0.52 };
  }

  // ── Signed by ─────────────────────────────────────────────────────────────
  // Usually near the bottom: "Signature", name + post after a gap
  const signedMatch = full.match(
    /(?:signed\s*by|signature|අත්සන|கையொப்பம்)\s*[:–]?\s*(.+)/i,
  );
  if (signedMatch) {
    out.signedBy = { value: signedMatch[1].trim(), confidence: 0.70 };
  } else {
    // Last non-empty lines often contain the signatory
    const sigBlock = findSignatoryBlock(lines);
    if (sigBlock) out.signedBy = { value: sigBlock, confidence: 0.50 };
  }

  // ── Language detection ────────────────────────────────────────────────────
  const lang = detectLanguage(raw);
  out.language = { value: lang, confidence: 0.85 };

  // ── Body ──────────────────────────────────────────────────────────────────
  // The full raw text is always useful for search, even if messy
  if (raw.trim().length > 20) {
    out.body = { value: raw.trim(), confidence: 0.70 };
  }

  // Clear any value below MIN_CONFIDENCE
  for (const key of Object.keys(out) as FieldKey[]) {
    if (out[key].confidence < MIN_CONFIDENCE) {
      out[key] = { value: "", confidence: out[key].confidence };
    }
  }

  return out;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectLanguage(text: string): "si" | "ta" | "en" | "mixed" {
  // Sinhala unicode range: 0D80–0DFF
  const hasSinhala = /[\u0D80-\u0DFF]/.test(text);
  // Tamil unicode range: 0B80–0BFF
  const hasTamil = /[\u0B80-\u0BFF]/.test(text);
  // Basic Latin letters
  const hasEnglish = /[A-Za-z]{3,}/.test(text);

  const count = (hasSinhala ? 1 : 0) + (hasTamil ? 1 : 0) + (hasEnglish ? 1 : 0);
  if (count > 1) return "mixed";
  if (hasSinhala) return "si";
  if (hasTamil) return "ta";
  return "en";
}

function findSubjectCandidate(lines: string[]): string {
  // Skip short lines and lines that look like addresses/references
  for (const line of lines) {
    if (line.length < 8) continue;
    if (/^\d/.test(line)) continue; // starts with number — likely a ref
    if (/[:\/]/.test(line) && line.length < 30) continue; // short line with : or / — likely ref
    return line;
  }
  return "";
}

function extractAddressBlock(lines: string[], type: "from" | "to"): string {
  // Sri Lankan letters: addressee block usually spans 2-4 lines
  // "From" block tends to be top-right, "To" block tends to be top-left
  // Simple heuristic: grab the first 3-line block that looks like a name+post
  const start = type === "to" ? 0 : Math.floor(lines.length / 3);
  const candidates: string[] = [];
  for (let i = start; i < Math.min(start + 10, lines.length); i++) {
    const line = lines[i];
    if (!line || line.length < 4) continue;
    if (/(?:subject|re|date|විෂය|பொருள்)/i.test(line)) break;
    candidates.push(line);
    if (candidates.length >= 3) break;
  }
  return candidates.join(", ");
}

function findSignatoryBlock(lines: string[]): string {
  // Look at the last 8 lines for a name/post pattern
  const tail = lines.slice(-8);
  const result: string[] = [];
  for (const line of tail) {
    if (line.length < 4) continue;
    if (/(?:page|date|ref)/i.test(line)) continue;
    result.push(line);
    if (result.length >= 2) break;
  }
  return result.join(", ");
}
