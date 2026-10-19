"use client";

/**
 * Client-side letter store — persists saved letters in localStorage.
 * Each letter gets a unique id and a savedAt timestamp.
 */

import type { FieldValues } from "./types";

export interface SavedLetter {
  id: string;
  savedAt: number; // epoch ms
  values: FieldValues;
}

const STORAGE_KEY = "triscript.letters";

/** Generate a unique ID. Uses crypto.randomUUID when available (HTTPS/localhost),
 *  falls back to a timestamp+random string for plain HTTP on LAN IPs. */
function makeId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* not in secure context */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function load(): SavedLetter[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedLetter[];
  } catch {
    return [];
  }
}

function save(letters: SavedLetter[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(letters));
  } catch {
    /* storage full or unavailable */
  }
}

export function getLetters(): SavedLetter[] {
  return load();
}

export function saveLetter(values: FieldValues): SavedLetter {
  const letters = load();
  const letter: SavedLetter = {
    id: makeId(),
    savedAt: Date.now(),
    values,
  };
  letters.unshift(letter); // newest first
  save(letters);
  return letter;
}

export function updateLetter(id: string, values: FieldValues): boolean {
  const letters = load();
  const idx = letters.findIndex((l) => l.id === id);
  if (idx === -1) return false;
  letters[idx].values = values;
  save(letters);
  return true;
}

export function deleteLetter(id: string): boolean {
  const letters = load();
  const next = letters.filter((l) => l.id !== id);
  if (next.length === letters.length) return false;
  save(next);
  return true;
}

export function exportCsv(letters: SavedLetter[]): string {
  const FIELD_KEYS = [
    "date", "subject", "myNumber", "yourNumber",
    "from", "to", "signedBy", "language", "body",
  ] as const;

  const header = ["Saved at", ...FIELD_KEYS].join(",");
  const rows = letters.map((l) => {
    const date = new Date(l.savedAt).toISOString().slice(0, 19).replace("T", " ");
    const cols = [date, ...FIELD_KEYS.map((k) => csvCell(l.values[k] ?? ""))];
    return cols.join(",");
  });
  return [header, ...rows].join("\r\n");
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
