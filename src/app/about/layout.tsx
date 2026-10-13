import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "About – TRISCRIPT",
  description:
    "TRISCRIPT turns a phone photo of a letter into filled-in fields, in Sinhala, Tamil and English. Built in the open by the Eastern Province IT Volunteer Programme, Sri Lanka.",
};

export default function AboutLayout({ children }: { children: ReactNode }) {
  return children;
}
