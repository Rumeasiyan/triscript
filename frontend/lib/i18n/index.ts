import en from "./en";
import si from "./si";
import ta from "./ta";

export const messages = { en, si, ta } as const;
export type LanguageCode = keyof typeof messages;
export type MessageKey = keyof typeof en;
