/**
 * TRISCRIPT
 *
 * Turn a phone photo of a letter into filled-in fields —
 * Sinhala, Tamil and English.
 *
 * Usage in any Next.js app:
 *
 *   1. Install:   npm install triscript
 *   2. Mount the API routes (see README).
 *   3. Drop <ScanLetter> into any page:
 *
 *      import { ScanLetter } from "triscript";
 *
 *      export default function MyPage() {
 *        return (
 *          <ScanLetter onConfirm={(values) => console.log(values)} />
 *        );
 *      }
 */

// Types
export type {
  FieldKey,
  FieldResult,
  ReadFields,
  FieldValues,
  ReadResult,
  SessionStatus,
  SessionInfo,
  SessionPoll,
  ConfidenceLevel,
} from "./types";

export {
  FIELD_KEYS,
  MIN_CONFIDENCE,
  HIGH_CONFIDENCE,
  confidenceLevel,
  emptyValues,
  emptyFields,
} from "./types";
