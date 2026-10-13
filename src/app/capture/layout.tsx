import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Photograph the letter – TRISCRIPT",
  description: "Take a photo of the letter with your phone and send it to your computer.",
};

export default function CaptureLayout({ children }: { children: ReactNode }) {
  return children;
}
