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
    { href: "/register", label: t.nav.register },
    { href: "/about", label: t.nav.about },
  ];

  return (
    <>
      <a href="#main" className="skip-link">
        {t.skipToContent}
      </a>
      <header className="site-header">
        <div className="container header-row">
          <Link href="/" className="brand" aria-label={t.appName}>
            <span className="brand-mark" aria-hidden="true">
              ꙮ
            </span>
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
