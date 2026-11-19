"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { messages } from "@/lib/i18n";
import type { LanguageCode } from "@/lib/i18n";

export default function OrganisationPage() {
  const [language, setLanguage] = useState<LanguageCode>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem("triscript-language");
    if (stored === "si" || stored === "ta" || stored === "en") setLanguage(stored as LanguageCode);
  }, []);

  const text = messages[language];

  const links = [
    { href: "/organisation/tags",           label: text.tagsTitle },
    { href: "/organisation/correspondents", label: text.correspondentsTitle },
    { href: "/organisation/document-types", label: text.documentTypesTitle },
    { href: "/letters",                     label: text.lettersTitle },
    { href: "/search",                      label: text.searchTitle },
  ];

  return (
    <main className="min-h-screen bg-govBg">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="mb-4 flex items-center gap-2">
          <Link href="/" className="text-sm text-blue-800 underline">{text.navScan}</Link>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight text-govNavy">{text.manageOrganisation}</h1>
          <select
            value={language}
            onChange={e => { const v = e.target.value as LanguageCode; setLanguage(v); window.localStorage.setItem("triscript-language", v); }}
            className="rounded border-2 border-slate-300 bg-white px-3 py-2 text-sm font-semibold"
          >
            <option value="en">English</option>
            <option value="si">සිංහල</option>
            <option value="ta">தமிழ்</option>
          </select>
        </div>

        <ul className="mt-6 space-y-3">
          {links.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-12 items-center rounded border-2 border-slate-200 bg-white px-5 py-3 font-semibold text-blue-800 hover:bg-slate-50"
              >
                {label} →
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
