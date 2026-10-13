"use client";

import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function AboutPage() {
  const { t } = useI18n();
  return (
    <>
      <SiteHeader />
      <main id="main" className="container page">
        <h1>{t.about.title}</h1>
        <p className="lead">{t.about.tagline}</p>

        <section className="card stack" aria-labelledby="why-title">
          <h2 id="why-title">{t.about.whyTitle}</h2>
          <p>{t.about.whyBody}</p>
        </section>

        <section className="card stack" aria-labelledby="name-title">
          <h2 id="name-title">{t.about.nameTitle}</h2>
          <p>{t.about.nameBody}</p>
          <p className="scripts" aria-hidden="true">
            <span lang="si">සිංහල</span> · <span lang="ta">தமிழ்</span> ·{" "}
            <span lang="en">English</span>
          </p>
        </section>

        <section className="card stack" aria-labelledby="fields-title">
          <h2 id="fields-title">{t.about.fieldsTitle}</h2>
          <p>{t.about.fieldsBody}</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t.about.fieldColName}</th>
                  <th scope="col">{t.about.fieldColExample}</th>
                </tr>
              </thead>
              <tbody>
                {t.about.fieldRows.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td className="muted">{row.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card stack" aria-labelledby="privacy-title">
          <h2 id="privacy-title">{t.about.privacyTitle}</h2>
          <p>{t.about.privacyBody1}</p>
          <p>{t.about.privacyBody2}</p>
          <p className="notice muted">{t.about.testNotice}</p>
        </section>

        <section className="card stack" aria-labelledby="open-title">
          <h2 id="open-title">{t.about.openTitle}</h2>
          <p>{t.about.openBody}</p>
          <div className="actions">
            <a
              href="https://github.com/eastprovince-itvp/triscript"
              className="btn"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.about.githubLink}
            </a>
          </div>
        </section>

        <div className="actions">
          <Link href="/demo" className="btn btn-primary">
            {t.home.tryDemo}
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
