"use client";

import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function HomePage() {
  const { t } = useI18n();
  const steps = [
    { n: 1, title: t.home.step1Title, body: t.home.step1Body, icon: "⬛" },
    { n: 2, title: t.home.step2Title, body: t.home.step2Body, icon: "📷" },
    { n: 3, title: t.home.step3Title, body: t.home.step3Body, icon: "✓" },
  ];

  return (
    <>
      <SiteHeader />
      <main id="main" className="container page">

        {/* Hero */}
        <section className="hero">
          <div className="hero-eyebrow">
            <span aria-hidden="true">🌐</span>
            {t.home.heroEyebrow ?? "Sinhala · Tamil · English"}
          </div>
          <h1>{t.home.heroTitle}</h1>
          <p className="lead">{t.home.heroBody}</p>
          <div className="actions">
            <Link href="/demo" className="btn btn-primary">
              {t.home.tryDemo}
            </Link>
            <Link href="/register" className="btn">
              {t.home.tryRegister}
            </Link>
            <Link href="/about" className="btn btn-ghost">
              {t.nav.about} →
            </Link>
          </div>
        </section>

        {/* How it works */}
        <section aria-labelledby="how-title">
          <p className="section-title" id="how-title">{t.home.howTitle}</p>
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.n} className="card step">
                <span className="step-num" aria-hidden="true">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Feature cards */}
        <div className="two-col">
          <div className="card">
            <p className="section-title">{t.home.langTitle}</p>
            <p style={{ marginBottom: "1rem" }}>{t.home.langBody}</p>
            <p className="scripts" aria-hidden="true">
              <span lang="si">සිංහල</span> · <span lang="ta">தமிழ்</span> · <span lang="en">English</span>
            </p>
          </div>
          <div className="card">
            <p className="section-title">{t.home.privacyTitle}</p>
            <p style={{ marginBottom: "0.5rem" }}>{t.home.privacyBody}</p>
            <p className="muted">{t.home.testNotice}</p>
          </div>
        </div>

      </main>
      <SiteFooter />
    </>
  );
}
