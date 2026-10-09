"use client";

import Link from "next/link";
import { useI18n } from "./I18nProvider";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="site-footer">
      <div className="container">
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem 1.5rem",
        }}>
          <div>
            <p style={{ fontWeight: 600, color: "var(--ink-2)", marginBottom: "0.15em" }}>
              TRISCRIPT
            </p>
            <p>{t.footer.built}</p>
          </div>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <Link href="/about" style={{ color: "var(--muted)", fontSize: "0.85rem", textDecoration: "none" }}>
              {t.nav.about}
            </Link>
            <a
              href="https://github.com/eastprovince-itvp/triscript"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--muted)", fontSize: "0.85rem", textDecoration: "none" }}
            >
              GitHub
            </a>
          </div>
        </div>
        <p style={{ marginTop: "0.75rem", fontSize: "0.8rem", borderTop: "1px solid var(--line)", paddingTop: "0.75rem" }}>
          {t.footer.status}
        </p>
      </div>
    </footer>
  );
}
