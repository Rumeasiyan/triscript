import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Saved letters – TRISCRIPT",
  description: "View and edit letters scanned with TRISCRIPT.",
};

export default function LettersLayout({ children }: { children: ReactNode }) {
  return children;
}
