/**
 * TRISCRIPT
 *
 * Turn a phone photo of a letter or form into filled-in fields —
 * Sinhala, Tamil and English.
 *
 * Usage in any Next.js app:
 *
 *   1. Install:   npm install triscript
 *   2. Mount the API routes (see README).
 *   3. Use the components:
 *
 *      import { ScanLetter } from "@/components/ScanLetter"; // copy from the web app
 *      import { ScanForm } from "@/components/ScanForm";     // for forms
 *
 * This package exports types only. The React components live in the web app
 * source (src/components/) and can be copied into your project.
 */

// Letter types
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

// Form types
export type {
  FormFieldDef,
  FormType,
  FormValues,
  FormReadResult,
} from "./forms";

export {
  FORM_TYPES,
  FORM_TYPE_IDS,
  getFormType,
  emptyFormValues,
} from "./forms";
