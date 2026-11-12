import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TRISCRIPT — Trilingual Document Parser",
  description: "Local-network letter scanning and field review in Sinhala, Tamil, and English.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
