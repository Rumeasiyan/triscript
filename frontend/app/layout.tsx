import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "TRISCRIPT — Trilingual Document Parser",
  description: "Local-network letter scanning and field review in Sinhala, Tamil, and English.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-slate-50">
        <Navbar />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
