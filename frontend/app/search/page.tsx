"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiBase } from "@/lib/useSession";
import { LanguageCode, messages } from "@/lib/i18n";

type SearchField = { value: string; confidence: number };
type SearchResult = {
  id: number;
  formType: string;
  createdAt: string;
  fields: Record<string, SearchField>;
  snippet: string;
  tags: { id: number; name: string; colour: string }[];
};
type SearchPage = {
  total: number;
  offset: number;
  limit: number;
  results: SearchResult[];
};

function fieldVal(fields: Record<string, SearchField>, key: string): string {
  return fields?.[key]?.value ?? "";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function SearchPage() {
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("newest");
  const [formType, setFormType] = useState("");
  const [page, setPage] = useState(0);
  const limit = 20;

  const [result, setResult] = useState<SearchPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const text = messages[language];

  useEffect(() => {
    const stored = window.localStorage.getItem("triscript-language");
    if (stored === "si" || stored === "ta" || stored === "en") setLanguage(stored as LanguageCode);
  }, []);

  function buildUrl() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (sort !== "newest") params.set("sort", sort);
    if (formType) params.set("formType", formType);
    params.set("limit", String(limit));
    params.set("offset", String(page * limit));
    return `${apiBase}/api/letters/search?${params}`;
  }

  async function runSearch(resetPage = false) {
    const targetPage = resetPage ? 0 : page;
    if (resetPage) setPage(0);
    setLoading(true);
    setError("");
    setSubmitted(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (sort !== "newest") params.set("sort", sort);
    if (formType) params.set("formType", formType);
    params.set("limit", String(limit));
    params.set("offset", String(targetPage * limit));
    try {
      const res = await fetch(`${apiBase}/api/letters/search?${params}`);
      if (!res.ok) throw new Error(`${res.status}`);
      setResult(await res.json() as SearchPage);
    } catch {
      setError("Could not reach the search endpoint. Check the database.");
    } finally {
      setLoading(false);
    }
  }

  const totalPages = result ? Math.ceil(result.total / limit) : 0;

  return (
    <div className="min-h-screen bg-govBg text-govNavy">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div aria-hidden className="grid h-9 w-9 place-items-center rounded border border-blue-200 bg-blue-50 text-base font-extrabold text-blue-800">T</div>
            <span className="text-base font-bold tracking-tight">TRISCRIPT</span>
          </div>
          <nav className="flex items-center gap-2">
            <select
              value={language}
              onChange={e => { const v = e.target.value as LanguageCode; setLanguage(v); window.localStorage.setItem("triscript-language", v); }}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
            >
              <option value="en">English</option>
              <option value="ta">தமிழ்</option>
              <option value="si">සිංහල</option>
            </select>
            <Link href="/" className="rounded bg-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800">
              {text.navScan}
            </Link>
            <Link href="/letters" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
              {text.navInbox}
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-6 text-2xl font-bold">{text.searchTitle}</h1>

        {/* Search form */}
        <form
          onSubmit={e => { e.preventDefault(); runSearch(true); }}
          className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          {/* Main search box */}
          <div className="relative mb-4">
            <label htmlFor="search-q" className="sr-only">{text.searchLabel}</label>
            <input
              id="search-q"
              ref={inputRef}
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={text.searchPlaceholder}
              className="w-full rounded-lg border-2 border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-blue-700 focus:outline-none"
            />
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </div>

          {/* Filter row */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{text.dateFrom}</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{text.dateTo}</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{text.sortLabel}</label>
              <select value={sort} onChange={e => setSort(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
                <option value="newest">{text.sortNewest}</option>
                <option value="oldest">{text.sortOldest}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{text.searchFormType}</label>
              <input type="text" value={formType} onChange={e => setFormType(e.target.value)}
                placeholder="letter"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={loading}
              className="rounded bg-blue-700 px-5 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
              {loading ? "…" : text.searchButton}
            </button>
            {(q || dateFrom || dateTo || formType) && (
              <button type="button" onClick={() => { setQ(""); setDateFrom(""); setDateTo(""); setFormType(""); setResult(null); setSubmitted(false); }}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {text.searchClear}
              </button>
            )}
          </div>
        </form>

        {/* Error */}
        {error && <div className="mb-4 rounded border-l-4 border-rose-600 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}

        {/* Empty prompt */}
        {!submitted && !loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
            <svg className="h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <p className="text-sm">{text.searchEmpty}</p>
          </div>
        )}

        {/* Results count */}
        {result && submitted && (
          <p className="mb-4 text-sm text-slate-500">
            {text.searchResults.replace("{count}", String(result.total))}
          </p>
        )}

        {/* No results */}
        {result && result.total === 0 && submitted && (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
            <p className="text-sm">{text.searchNoResults}</p>
          </div>
        )}

        {/* Results list */}
        {result && result.results.length > 0 && (
          <div className="space-y-4">
            {result.results.map(r => {
              const subject = fieldVal(r.fields, "subject");
              const from = fieldVal(r.fields, "from");
              const date = fieldVal(r.fields, "date");
              const myNumber = fieldVal(r.fields, "myNumber");
              return (
                <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <p className="font-semibold text-govNavy">
                      {subject || <span className="italic text-slate-400">—</span>}
                    </p>
                    <span className="shrink-0 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                      {r.formType}
                    </span>
                  </div>
                  <div className="mb-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    {from && <span><strong>{text.from}:</strong> {from}</span>}
                    {date && <span><strong>{text.date}:</strong> {date}</span>}
                    {myNumber && <span className="font-mono">{myNumber}</span>}
                    <span>{formatDate(r.createdAt)}</span>
                  </div>
                  {/* Snippet with highlight markup — rendered as safe HTML
                      because ts_headline produces <mark>…</mark> which we
                      HTML-escaped at app layer; we re-inject safely here. */}
                  {r.snippet && (
                    <div className="rounded bg-amber-50 px-3 py-2 text-xs text-slate-700 leading-relaxed">
                      <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">{text.searchSnippet}:</span>
                      <span dangerouslySetInnerHTML={{ __html: r.snippet }} />
                    </div>
                  )}
                  {/* Tags */}
                  {r.tags && r.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.tags.map(t => (
                        <span key={t.id} className="rounded px-2 py-0.5 text-[11px] font-semibold text-white"
                          style={{ backgroundColor: t.colour }}>
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <button disabled={page === 0} onClick={() => { setPage(p => p - 1); runSearch(); }}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              {text.paginationPrev}
            </button>
            <span className="text-sm text-slate-500">
              {text.paginationPage.replace("{current}", String(page + 1)).replace("{total}", String(totalPages))}
            </span>
            <button disabled={page >= totalPages - 1} onClick={() => { setPage(p => p + 1); runSearch(); }}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              {text.paginationNext}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
