"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useI18n } from "./I18nProvider";

export function SiteHeader({ minimal = false }: { minimal?: boolean }) {
  const { t } = useI18n();
  const pathname = usePathname();

  const links = [
    { href: "/", label: t.nav.home },
    { href: "/demo", label: t.nav.demo },
    { href: "/letters", label: t.nav.letters },
  ];

  return (
    <>
      <a href="#main" className="skip-link sr-only">
        {t.skipToContent}
      </a>
      <header className="site-header">
        <div className="container header-row">
          <Link href="/" className="brand" aria-label={t.appName}>
            <span className="brand-icon" aria-hidden="true">T</span>
            {t.appName}
          </Link>
          {!minimal && (
            <nav aria-label="Main" className="main-nav">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={pathname === l.href ? "page" : undefined}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          )}
          <LanguageSwitcher />
        </div>
      </header>
    </>
  );
}
