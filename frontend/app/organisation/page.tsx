import Link from "next/link";

export const metadata = {
  title: "TRISCRIPT — Manage Organisation",
};

export default function OrganisationPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Manage Organisation</h1>
      <p className="mt-2 text-sm text-slate-600">
        Tags, correspondents and document types used to organise saved letters.
      </p>
      <ul className="mt-8 space-y-3">
        {[
          { href: "/organisation/tags", label: "Tags" },
          { href: "/organisation/correspondents", label: "Correspondents" },
          { href: "/organisation/document-types", label: "Document Types" },
          { href: "/letters", label: "Saved Letters" },
        ].map(({ href, label }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex min-h-12 items-center rounded border-2 border-slate-200 bg-white px-5 py-3 font-semibold text-blue-800 hover:bg-slate-50"
            >
              {label} →
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
