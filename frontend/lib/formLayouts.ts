import type { Letter } from "@/lib/useSession";

const fieldNames = [
  "subject",
  "myNumber",
  "yourNumber",
  "date",
  "from",
  "to",
  "signedBy",
  "language",
  "body",
] as const satisfies readonly (keyof Letter)[];

export type FormLayout = {
  id: string;
  titleKey: "titleQr" | "leaveApplicationTitle";
  introKey: "introQr" | "leaveApplicationIntro";
  fields: readonly (keyof Letter)[];
};

function isFieldName(value: unknown): value is keyof Letter {
  return typeof value === "string" && fieldNames.some((field) => field === value);
}

export function parseFormLayout(value: unknown): FormLayout {
  if (!value || typeof value !== "object") throw new Error("Form layout must be an object.");
  const layout = value as Record<string, unknown>;
  if (
    typeof layout.id !== "string" ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(layout.id) ||
    (layout.titleKey !== "titleQr" && layout.titleKey !== "leaveApplicationTitle") ||
    (layout.introKey !== "introQr" && layout.introKey !== "leaveApplicationIntro") ||
    !Array.isArray(layout.fields) ||
    layout.fields.length === 0 ||
    !layout.fields.every(isFieldName) ||
    !layout.fields.includes("body") ||
    new Set(layout.fields).size !== layout.fields.length
  ) {
    throw new Error("Form layout contains an invalid identifier, label, or field list.");
  }
  return {
    id: layout.id,
    titleKey: layout.titleKey,
    introKey: layout.introKey,
    fields: layout.fields,
  };
}
