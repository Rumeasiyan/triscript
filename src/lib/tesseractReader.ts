/**
 * Tesseract OCR reader — calls the system Tesseract binary via child_process.
 *
 * Requires Tesseract to be installed on the server:
 *   Windows: https://github.com/UB-Mannheim/tesseract/wiki
 *   Linux:   sudo apt install tesseract-ocr tesseract-ocr-sin tesseract-ocr-tam
 *   macOS:   brew install tesseract tesseract-lang
 *
 * If Tesseract is not installed, throws an error and the caller falls back
 * to the manual entry form.
 */

import { execFile } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import type { FieldKey, ReadFields } from "./types";
import { emptyFields, MIN_CONFIDENCE } from "./types";

const execFileAsync = promisify(execFile);

// Common install locations for Tesseract on Windows
const WINDOWS_PATHS = [
  "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
  "C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe",
];

function getTesseractBin(): string {
  // Try PATH first
  if (process.platform !== "win32") return "tesseract";
  // On Windows, check known install locations if not in PATH
  for (const p of WINDOWS_PATHS) {
    try {
      if (existsSync(p)) return p;
    } catch {}
  }
  return "tesseract"; // fallback — will fail if not in PATH
}

/** Check if tesseract binary is available */
export async function isTesseractAvailable(): Promise<boolean> {
  try {
    await execFileAsync(getTesseractBin(), ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function readWithTesseract(imageBuffer: Buffer): Promise<ReadFields> {
  const id = `triscript-${Date.now()}`;
  const imgPath = join(tmpdir(), `${id}.jpg`);
  const outBase = join(tmpdir(), id);
  const txtPath = `${outBase}.txt`;

  writeFileSync(imgPath, imageBuffer);

  try {
    // Run tesseract with English + Sinhala + Tamil
    const bin = getTesseractBin();
    let langs = "eng+sin+tam";
    try {
      await execFileAsync(bin, [imgPath, outBase, "-l", langs, "--psm", "1"], {
        timeout: 30000,
      });
    } catch {
      // Retry with English only (in case sin/tam lang packs not installed)
      langs = "eng";
      await execFileAsync(bin, [imgPath, outBase, "-l", langs, "--psm", "1"], {
        timeout: 30000,
      });
    }

    const text = existsSync(txtPath) ? readFileSync(txtPath, "utf8") : "";
    return extractFields(text);
  } finally {
    try { unlinkSync(imgPath); } catch {}
    try { unlinkSync(txtPath); } catch {}
  }
}

// ─── Field extraction ─────────────────────────────────────────────────────────

function extractFields(raw: string): ReadFields {
  const out = emptyFields();
  if (!raw.trim()) return out;

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Date
  const datePatterns = [
    /\b(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})\b/,
    /\b(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{4})\b/,
    /\b(\d{1,2}\s+\w+\s+\d{4})\b/i,
  ];
  for (const pat of datePatterns) {
    const m = raw.match(pat);
    if (m) { out.date = { value: m[1].trim(), confidence: 0.80 }; break; }
  }

  // Reference numbers (e.g. DS/EST/2026/014)
  const refPattern = /\b([A-Z]{1,8}\/[A-Z0-9\/\-]{2,}\/\d{4}\/\d+)\b/g;
  const refs = [...raw.matchAll(refPattern)].map((m) => m[1]);
  if (refs[0]) out.myNumber   = { value: refs[0], confidence: 0.78 };
  if (refs[1]) out.yourNumber = { value: refs[1], confidence: 0.72 };

  const myMatch = raw.match(/(?:my\s*n[o0]|ref(?:erence)?\s*n[o0])\.?\s*[:–\-]?\s*([A-Za-z0-9\/\-\.]+)/i);
  if (myMatch) out.myNumber = { value: myMatch[1].trim(), confidence: 0.84 };

  const yourMatch = raw.match(/(?:your\s*n[o0])\.?\s*[:–\-]?\s*([A-Za-z0-9\/\-\.]+)/i);
  if (yourMatch) out.yourNumber = { value: yourMatch[1].trim(), confidence: 0.80 };

  // Subject
  const subjectMatch = raw.match(/(?:subject|re|sub)\s*[:–\-]\s*(.{5,120})/i);
  if (subjectMatch) {
    out.subject = { value: subjectMatch[1].trim(), confidence: 0.82 };
  } else {
    const candidate = lines.find(
      (l) => l.length >= 10 && !/^\d/.test(l) && !/^[A-Z]{1,5}\//.test(l) && !/^\d{4}/.test(l),
    );
    if (candidate) out.subject = { value: candidate, confidence: 0.52 };
  }

  // From / To
  const fromMatch = raw.match(/(?:^|\n)\s*from\s*[:–\-]\s*(.+)/im);
  if (fromMatch) out.from = { value: fromMatch[1].trim(), confidence: 0.74 };

  const toMatch = raw.match(/(?:^|\n)\s*to\s*[:–\-,]\s*(.+)/im);
  if (toMatch) out.to = { value: toMatch[1].trim(), confidence: 0.74 };

  // Signed by
  const signedMatch = raw.match(/(?:signed|signature)\s*[:–\-]?\s*(.+)/i);
  if (signedMatch) {
    out.signedBy = { value: signedMatch[1].trim(), confidence: 0.70 };
  } else {
    const tail = lines.slice(-5).filter((l) => l.length > 3).slice(0, 2);
    if (tail.length) out.signedBy = { value: tail.join(", "), confidence: 0.48 };
  }

  // Language
  out.language = { value: detectLanguage(raw), confidence: 0.88 };

  // Body
  if (raw.trim().length > 30) {
    out.body = { value: raw.trim(), confidence: 0.72 };
  }

  // Clear below MIN_CONFIDENCE
  for (const key of Object.keys(out) as FieldKey[]) {
    if (out[key].confidence < MIN_CONFIDENCE) {
      out[key] = { value: "", confidence: out[key].confidence };
    }
  }

  return out;
}

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
