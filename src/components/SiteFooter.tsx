"use client";

import { useI18n } from "./I18nProvider";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="site-footer">
      <div className="container">
        <p>{t.footer.built}</p>
        <p>{t.footer.status}</p>
      </div>
    </footer>
  );
}
