"use client";

import { LANGS } from "@/lib/i18n";
import { useI18n } from "./I18nProvider";

export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t.language} className="lang-switch">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          className="lang-btn"
          aria-pressed={lang === l.code}
          onClick={() => setLang(l.code)}
        >
          {l.native}
        </button>
      ))}
    </div>
  );
}
