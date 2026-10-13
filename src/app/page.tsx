"use client";

import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function HomePage() {
  const { t } = useI18n();
  const steps = [
    { n: 1, title: t.home.step1Title, body: t.home.step1Body },
    { n: 2, title: t.home.step2Title, body: t.home.step2Body },
    { n: 3, title: t.home.step3Title, body: t.home.step3Body },
  ];

  return (
    <>
      <SiteHeader />
      <main id="main" className="container page">
        <section className="hero">
          <h1>{t.home.heroTitle}</h1>
          <p className="lead">{t.home.heroBody}</p>
          <div className="actions">
            <Link href="/demo" className="btn btn-primary">
              {t.home.tryDemo}
            </Link>
            <Link href="/register" className="btn">
              {t.home.tryRegister}
            </Link>
          </div>
        </section>

        <section aria-labelledby="how-title">
          <h2 id="how-title">{t.home.howTitle}</h2>
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.n} className="card step">
                <span className="step-num" aria-hidden="true">
                  {s.n}
                </span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="two-col">
          <div className="card">
            <h2>{t.home.langTitle}</h2>
            <p>{t.home.langBody}</p>
            <p className="scripts" aria-hidden="true">
              <span lang="si">සිංහල</span> · <span lang="ta">தமிழ்</span> · <span lang="en">English</span>
            </p>
          </div>
          <div className="card">
            <h2>{t.home.privacyTitle}</h2>
            <p>{t.home.privacyBody}</p>
            <p className="muted">{t.home.testNotice}</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
