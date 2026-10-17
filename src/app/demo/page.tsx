"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { ScanLetter } from "@/components/ScanLetter";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { saveLetter } from "@/lib/letterStore";
import { FIELD_KEYS, type FieldValues } from "@/lib/types";

export default function DemoPage() {
  const { t } = useI18n();
  const [saved, setSaved] = useState<FieldValues | null>(null);

  function handleConfirm(values: FieldValues) {
    saveLetter(values);
    setSaved(values);
  }

  return (
    <>
      <SiteHeader />
      <main id="main" className="container page">
        <h1>{t.pair.title}</h1>
        <ScanLetter onConfirm={handleConfirm} />

        {saved && (
          <section className="card" aria-labelledby="saved-title">
            <h2 id="saved-title">{t.review.saved}</h2>
            <dl className="saved-list">
              {FIELD_KEYS.map((k) => (
                <div key={k}>
                  <dt>{t.fields[k]}</dt>
                  <dd dir="auto">{saved[k] || "–"}</dd>
                </div>
              ))}
            </dl>
            <div className="actions" style={{ marginTop: "1rem" }}>
              <Link href="/letters" className="btn btn-primary">
                {t.nav.letters} →
              </Link>
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
