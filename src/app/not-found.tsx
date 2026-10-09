"use client";

import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

/**
 * Shown for any URL that has no matching route.
 * Must be a Client Component because it uses useI18n.
 */
export default function NotFound() {
  const { t } = useI18n();
  return (
    <>
      <SiteHeader />
      <main id="main" className="container page">
        <section className="card stack" aria-labelledby="nf-title">
          <h1 id="nf-title">{t.notFound.title}</h1>
          <p className="lead">{t.notFound.body}</p>
          <div className="actions">
            <Link href="/" className="btn btn-primary">
              {t.notFound.home}
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
