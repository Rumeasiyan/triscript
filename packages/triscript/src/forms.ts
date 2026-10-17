/**
 * Form type definitions for TRISCRIPT (re-exported from the main app).
 * Keep this in sync with src/lib/forms.ts.
 */

export interface FormFieldDef {
  key: string;
  label: string;
  hint: string;
  required?: boolean;
}

export interface FormType {
  id: string;
  name: string;
  description: string;
  fields: FormFieldDef[];
}

export type FormValues = Record<string, string>;

export type FormReadResult = {
  formId: string;
  values: FormValues;
  confidences: Record<string, number>;
  demo: boolean;
};

const LEAVE_APPLICATION: FormType = {
  id: "leave-application",
  name: "Leave Application",
  description: "A standard Sri Lankan government leave application form.",
  fields: [
    { key: "applicantName", label: "Name of applicant", hint: "Name of the person applying", required: true },
    { key: "post", label: "Post / Designation", hint: "Job title or post" },
    { key: "department", label: "Department / Office", hint: "Office or department name" },
    { key: "leaveType", label: "Type of leave", hint: "Annual, Casual, Medical, No-pay", required: true },
    { key: "fromDate", label: "From date", hint: "First day of leave, YYYY-MM-DD", required: true },
    { key: "toDate", label: "To date", hint: "Last day of leave, YYYY-MM-DD", required: true },
    { key: "days", label: "Number of days", hint: "Total days requested" },
    { key: "reason", label: "Reason", hint: "Reason for leave" },
    { key: "signedDate", label: "Date signed", hint: "Date of signature, YYYY-MM-DD" },
  ],
};

const REQUISITION: FormType = {
  id: "requisition",
  name: "Requisition / Indent",
  description: "A standard Sri Lankan government stationery or stores requisition form.",
  fields: [
    { key: "department", label: "Department / Office", hint: "Requesting office", required: true },
    { key: "requestedBy", label: "Requested by", hint: "Name and post of requester" },
    { key: "date", label: "Date", hint: "Date of requisition, YYYY-MM-DD" },
    { key: "referenceNumber", label: "Reference number", hint: "Requisition serial number" },
    { key: "items", label: "Items requested", hint: "List of items, quantities; one per line" },
    { key: "purpose", label: "Purpose", hint: "Purpose or reason" },
    { key: "approvedBy", label: "Approved by", hint: "Approving officer name and post" },
  ],
};

export const FORM_TYPES: Record<string, FormType> = {
  [LEAVE_APPLICATION.id]: LEAVE_APPLICATION,
  [REQUISITION.id]: REQUISITION,
};

export const FORM_TYPE_IDS = Object.keys(FORM_TYPES);

export function getFormType(id: string): FormType | undefined {
  return FORM_TYPES[id];
}

export function emptyFormValues(formType: FormType): FormValues {
  return Object.fromEntries(formType.fields.map((f) => [f.key, ""]));
}
