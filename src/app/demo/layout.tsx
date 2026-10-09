import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Scan a letter – TRISCRIPT",
  description:
    "Scan a QR code with your phone, photograph a letter, and see the fields filled on your computer. Demo for TRISCRIPT.",
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return children;
}
