/**
 * Form type definitions for TRISCRIPT.
 *
 * A "form type" describes a common paper form (leave application, requisition,
 * etc.). Each form type lists the fields it contains and how to prompt the OCR
 * reader to find them. New form types can be added here without changing the core.
 *
 * Fields are free-form key→string maps; they are separate from the letter fields
 * defined in types.ts.
 */

export interface FormFieldDef {
  /** Internal key, used in the result object */
  key: string;
  /** Human-readable label (English; UI uses i18n overrides when available) */
  label: string;
  /** OCR hint sent to the reader — describes where/how this field appears */
  hint: string;
  /** true if this field must not be left empty */
  required?: boolean;
}

export interface FormType {
  /** Unique identifier, e.g. "leave-application" */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description sent to the reader to explain the form layout */
  description: string;
  /** Fields to extract */
  fields: FormFieldDef[];
}

export type FormValues = Record<string, string>;
export type FormReadResult = {
  formId: string;
  values: FormValues;
  confidences: Record<string, number>;
  demo: boolean;
};

// ─── Built-in form types ──────────────────────────────────────────────────────

const LEAVE_APPLICATION: FormType = {
  id: "leave-application",
  name: "Leave Application",
  description:
    "A standard Sri Lankan government leave application form. " +
    "The form has fields for the applicant's name, post, department, " +
    "the type of leave, the dates of leave, and a reason.",
  fields: [
    { key: "applicantName", label: "Name of applicant", hint: "Name of the person applying for leave", required: true },
    { key: "post", label: "Post / Designation", hint: "Job title or post of the applicant" },
    { key: "department", label: "Department / Office", hint: "Office or department name" },
    { key: "leaveType", label: "Type of leave", hint: "e.g. Annual, Casual, Medical, No-pay", required: true },
    { key: "fromDate", label: "From date", hint: "First day of leave, in YYYY-MM-DD format", required: true },
    { key: "toDate", label: "To date", hint: "Last day of leave, in YYYY-MM-DD format", required: true },
    { key: "days", label: "Number of days", hint: "Total days of leave requested" },
    { key: "reason", label: "Reason", hint: "Reason for leave" },
    { key: "signedDate", label: "Date signed", hint: "Date of signature, YYYY-MM-DD" },
  ],
};

const REQUISITION: FormType = {
  id: "requisition",
  name: "Requisition / Indent",
  description:
    "A standard Sri Lankan government stationery or stores requisition (indent) form. " +
    "The form lists items needed, quantities, and who is requesting them.",
  fields: [
    { key: "department", label: "Department / Office", hint: "Requesting office or department", required: true },
    { key: "requestedBy", label: "Requested by", hint: "Name and post of the person making the request" },
    { key: "date", label: "Date", hint: "Date of requisition, YYYY-MM-DD" },
    { key: "referenceNumber", label: "Reference number", hint: "Requisition reference or serial number" },
    { key: "items", label: "Items requested", hint: "List of items, quantities and unit; one per line" },
    { key: "purpose", label: "Purpose", hint: "Purpose or reason for the requisition" },
    { key: "approvedBy", label: "Approved by", hint: "Name and post of approving officer" },
  ],
};

/** All built-in form types, keyed by id. */
export const FORM_TYPES: Record<string, FormType> = {
  [LEAVE_APPLICATION.id]: LEAVE_APPLICATION,
  [REQUISITION.id]: REQUISITION,
};

export const FORM_TYPE_IDS = Object.keys(FORM_TYPES);

export function getFormType(id: string): FormType | undefined {
  return FORM_TYPES[id];
}

/** Return empty values map for a form type. */
export function emptyFormValues(formType: FormType): FormValues {
  return Object.fromEntries(formType.fields.map((f) => [f.key, ""]));
}
