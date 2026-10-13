"use client";

import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { ScanLetter } from "@/components/ScanLetter";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { FIELD_KEYS, type FieldValues } from "@/lib/types";

export default function DemoPage() {
  const { t } = useI18n();
  const [saved, setSaved] = useState<FieldValues | null>(null);

  return (
    <>
      <SiteHeader />
      <main id="main" className="container page">
        <h1>{t.pair.title}</h1>
        <ScanLetter onConfirm={setSaved} />

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
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
