"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/",             label: "Scan",          icon: "📷" },
  { href: "/letters",      label: "Letters",        icon: "📋" },
  { href: "/organisation", label: "Organisation",   icon: "🏷️" },
];

export default function Navbar() {
  const pathname = usePathname();

  // Don't show on phone capture pages (/m/...)
  if (pathname.startsWith("/m/")) return null;

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-1 px-4 py-2 sm:px-6">
        {/* Brand */}
        <Link href="/" className="mr-4 flex items-center gap-2 font-extrabold text-govNavy">
          <span className="text-blue-700">T</span>
          <span className="hidden sm:inline text-sm tracking-tight">TRISCRIPT</span>
        </Link>

        {/* Nav links */}
        {links.map(({ href, label, icon }) => {
          const active =
            href === "/"
              ? pathname === "/" || pathname.startsWith("/forms")
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "bg-blue-700 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span aria-hidden="true">{icon}</span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
