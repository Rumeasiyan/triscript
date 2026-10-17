/** Fields TRISCRIPT reads from a letter (first release). */
export const FIELD_KEYS = [
  "subject",
  "myNumber",
  "yourNumber",
  "date",
  "from",
  "to",
  "signedBy",
  "language",
  "body",
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

/** One value read from the paper, with how sure the reader is (0 to 1). */
export interface FieldResult {
  value: string;
  confidence: number;
}

export type ReadFields = Record<FieldKey, FieldResult>;
export type FieldValues = Record<FieldKey, string>;

export interface ReadResult {
  fields: ReadFields;
  /** True when the built-in demo reader produced this (invented TEST values). */
  demo: boolean;
}

/** Below this confidence a value is left empty rather than guessed. */
export const MIN_CONFIDENCE = 0.5;
/** At or above this confidence a value is shown as "high". */
export const HIGH_CONFIDENCE = 0.85;

export type ConfidenceLevel = "high" | "medium" | "low" | "empty";

export function confidenceLevel(result: FieldResult): ConfidenceLevel {
  if (!result.value.trim()) return "empty";
  if (result.confidence >= HIGH_CONFIDENCE) return "high";
  if (result.confidence >= MIN_CONFIDENCE) return "medium";
  return "low";
}

export function emptyValues(): FieldValues {
  return Object.fromEntries(FIELD_KEYS.map((k) => [k, ""])) as FieldValues;
}

export function emptyFields(): ReadFields {
  return Object.fromEntries(
    FIELD_KEYS.map((k) => [k, { value: "", confidence: 0 }]),
  ) as ReadFields;
}

export type SessionStatus = "waiting" | "photo";

export interface SessionInfo {
  id: string;
  expiresAt: number; // epoch ms
}

export interface SessionPoll {
  status: SessionStatus;
  expiresAt: number;
}
