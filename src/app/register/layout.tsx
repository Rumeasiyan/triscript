import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Letter register – TRISCRIPT",
  description:
    "A second page that reuses the TRISCRIPT scan component to build a simple letter register.",
};

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return children;
}
