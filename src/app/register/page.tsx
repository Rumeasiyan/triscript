"use client";

import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { ScanLetter } from "@/components/ScanLetter";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import type { FieldValues } from "@/lib/types";

/**
 * A second page that reuses <ScanLetter />, to show the component can be added
 * to any screen without changing it (milestone 4: Reuse).
 * Letters are kept in this page's memory only; a real system would send them
 * to its own database inside onConfirm.
 */
export default function RegisterPage() {
  const { t } = useI18n();
  const [letters, setLetters] = useState<FieldValues[]>([]);
  const [adding, setAdding] = useState(false);

  return (
    <>
      <SiteHeader />
      <main id="main" className="container page">
        <h1>{t.register.title}</h1>
        <p className="lead">{t.register.intro}</p>

        {adding ? (
          <ScanLetter
            onConfirm={(v) => {
              setLetters((prev) => [v, ...prev]);
              setAdding(false);
            }}
          />
        ) : (
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              {t.register.addLetter}
            </button>
          </div>
        )}

        <section className="card" aria-labelledby="list-title">
          <h2 id="list-title">{t.register.listTitle}</h2>
          {letters.length === 0 ? (
            <p className="muted">{t.register.empty}</p>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t.register.columns.date}</th>
                      <th scope="col">{t.register.columns.subject}</th>
                      <th scope="col">{t.register.columns.from}</th>
                      <th scope="col">{t.register.columns.ref}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {letters.map((l, i) => (
                      <tr key={i}>
                        <td>{l.date || "–"}</td>
                        <td dir="auto">{l.subject || "–"}</td>
                        <td dir="auto">{l.from || "–"}</td>
                        <td>{l.myNumber || "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="actions">
                <button type="button" className="btn" onClick={() => setLetters([])}>
                  {t.register.clear}
                </button>
              </div>
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
