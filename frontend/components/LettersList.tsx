"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { messages } from "@/lib/i18n";
import type { LanguageCode } from "@/lib/i18n";
import {
  type Correspondent,
  type DocumentType,
  type LetterSummary,
  type Tag,
  listCorrespondents,
  listDocumentTypes,
  listLetters,
  listTags,
  patchLetter,
} from "@/lib/metaApi";

export default function LettersList() {
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [letters, setLetters] = useState<LetterSummary[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [allCorrespondents, setAllCorrespondents] = useState<Correspondent[]>([]);
  const [allDocTypes, setAllDocTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [filterTags, setFilterTags] = useState<number[]>([]);
  const [filterCorrespondent, setFilterCorrespondent] = useState<number | undefined>();
  const [filterDocType, setFilterDocType] = useState<number | undefined>();

  // Edit modal state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTags, setEditTags] = useState<number[]>([]);
  const [editCorrespondent, setEditCorrespondent] = useState<number | "">("");
  const [editDocType, setEditDocType] = useState<number | "">("");
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editSuccess, setEditSuccess] = useState(false);

  const text = messages[language];

  useEffect(() => {
    const stored = window.localStorage.getItem("triscript-language");
    if (stored === "si" || stored === "ta" || stored === "en") setLanguage(stored as LanguageCode);
  }, []);

  // Load reference data
  useEffect(() => {
    void Promise.all([listTags(), listCorrespondents(), listDocumentTypes()]).then(
      ([tags, corr, docTypes]) => {
        setAllTags(tags);
        setAllCorrespondents(corr);
        setAllDocTypes(docTypes);
      }
    );
  }, []);

  // Load letters (re-runs when filters change)
  useEffect(() => {
    setLoading(true);
    setError("");
    listLetters({
      tag: filterTags.length > 0 ? filterTags : undefined,
      correspondent: filterCorrespondent,
      documentType: filterDocType,
    })
      .then(setLetters)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filterTags, filterCorrespondent, filterDocType]);

  function toggleTagFilter(id: number) {
    setFilterTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  function clearFilters() {
    setFilterTags([]);
    setFilterCorrespondent(undefined);
    setFilterDocType(undefined);
  }

  function openEdit(letter: LetterSummary) {
    setEditingId(letter.id);
    setEditTags(letter.tags.map((t) => t.id));
    setEditCorrespondent(letter.correspondentId ?? "");
    setEditDocType(letter.documentTypeId ?? "");
    setEditError("");
    setEditSuccess(false);
  }

  function toggleEditTag(id: number) {
    setEditTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  async function handleSaveEdit() {
    if (editingId == null) return;
    setEditSaving(true);
    setEditError("");
    setEditSuccess(false);
    try {
      const updated = await patchLetter(editingId, {
        tagIds: editTags,
        correspondentId: editCorrespondent !== "" ? Number(editCorrespondent) : undefined,
        documentTypeId: editDocType !== "" ? Number(editDocType) : undefined,
        clearCorrespondent: editCorrespondent === "",
        clearDocumentType: editDocType === "",
      });
      setLetters((prev) => prev.map((l) => (l.id === editingId ? updated : l)));
      setEditSuccess(true);
      setTimeout(() => setEditingId(null), 800);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : text.metadataFailed);
    } finally {
      setEditSaving(false);
    }
  }

  const hasFilters = filterTags.length > 0 || filterCorrespondent !== undefined || filterDocType !== undefined;

  return (
    <div className="min-h-screen bg-slate-50 text-govNavy">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">

        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm">
              <Link href="/organisation" className="text-blue-800 underline">{text.manageOrganisation}</Link>
              <span className="text-slate-400">›</span>
              <span className="font-semibold">{text.lettersTitle}</span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold">{text.lettersTitle}</h1>
          </div>
          <div>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              className="rounded border-2 border-slate-300 bg-white px-3 py-2 text-sm font-semibold"
            >
              <option value="en">English</option>
              <option value="si">සිංහල</option>
              <option value="ta">தமிழ்</option>
            </select>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5 space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          {/* Tag chips */}
          {allTags.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">{text.filterByTag}</p>
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTagFilter(tag.id)}
                    className={`flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-bold transition-colors ${
                      filterTags.includes(tag.id)
                        ? "border-transparent text-white"
                        : "border-slate-300 bg-white text-slate-800"
                    }`}
                    style={filterTags.includes(tag.id) ? { backgroundColor: tag.colour, borderColor: tag.colour } : {}}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: filterTags.includes(tag.id) ? "white" : tag.colour }}
                      aria-hidden="true"
                    />
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {allCorrespondents.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                  {text.filterByCorrespondent}
                </label>
                <select
                  value={filterCorrespondent ?? ""}
                  onChange={(e) => setFilterCorrespondent(e.target.value ? Number(e.target.value) : undefined)}
                  className="min-h-10 rounded border-2 border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="">—</option>
                  {allCorrespondents.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            {allDocTypes.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                  {text.filterByDocumentType}
                </label>
                <select
                  value={filterDocType ?? ""}
                  onChange={(e) => setFilterDocType(e.target.value ? Number(e.target.value) : undefined)}
                  className="min-h-10 rounded border-2 border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="">—</option>
                  {allDocTypes.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}
            {hasFilters && (
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-10 rounded border-2 border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  {text.clearFilters}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Letters */}
        {loading ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : error ? (
          <p role="alert" className="text-sm font-semibold text-red-900">{error}</p>
        ) : letters.length === 0 ? (
          <p className="text-sm text-slate-600">{text.noLetters}</p>
        ) : (
          <ul className="space-y-3">
            {letters.map((letter) => {
              const fields = letter.fields as Record<string, { value: string; confidence: number }>;
              const subject = fields["subject"]?.value || fields["Subject"]?.value || "";
              const from = fields["from"]?.value || fields["From"]?.value || "";
              const date = fields["date"]?.value || fields["Date"]?.value || "";
              return (
                <li key={letter.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-500">#{letter.id}</span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {letter.formType}
                        </span>
                        {letter.documentType && (
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                            {letter.documentType.name}
                          </span>
                        )}
                      </div>
                      {subject && <p className="mt-1 font-semibold text-slate-950 truncate">{subject}</p>}
                      {from && <p className="text-sm text-slate-600">{text.from}: {from}</p>}
                      {date && <p className="text-xs text-slate-500">{text.date}: {date}</p>}
                      {letter.correspondent && (
                        <p className="mt-1 text-xs text-slate-600">
                          <span className="font-semibold">{text.letterCorrespondent}:</span> {letter.correspondent.name}
                        </p>
                      )}
                      {/* Tag chips */}
                      {letter.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {letter.tags.map((tag) => (
                            <span
                              key={tag.id}
                              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-white"
                              style={{ backgroundColor: tag.colour }}
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-xs text-slate-500">
                        {new Date(letter.createdAt).toLocaleDateString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => openEdit(letter)}
                        className="min-h-9 rounded border-2 border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50"
                      >
                        {text.editMetadata}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Edit metadata modal */}
      {editingId !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={text.editMetadata}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-extrabold">{text.editMetadata}</h2>

            {editError && <p role="alert" className="mt-2 text-sm font-semibold text-red-900">{editError}</p>}
            {editSuccess && <p role="status" className="mt-2 text-sm font-semibold text-emerald-800">{text.metadataSaved}</p>}

            {/* Tags */}
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">{text.letterTags}</p>
              {allTags.length === 0 ? (
                <p className="text-sm text-slate-500">{text.noTags}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {allTags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleEditTag(tag.id)}
                      className={`flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-bold transition-colors ${
                        editTags.includes(tag.id)
                          ? "border-transparent text-white"
                          : "border-slate-300 bg-white text-slate-800"
                      }`}
                      style={editTags.includes(tag.id) ? { backgroundColor: tag.colour, borderColor: tag.colour } : {}}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Correspondent */}
            <div className="mt-4">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                {text.letterCorrespondent}
              </label>
              <select
                value={editCorrespondent}
                onChange={(e) => setEditCorrespondent(e.target.value ? Number(e.target.value) : "")}
                className="min-h-11 w-full rounded border-2 border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">— {text.letterCorrespondent} —</option>
                {allCorrespondents.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Document type */}
            <div className="mt-4">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                {text.letterDocumentType}
              </label>
              <select
                value={editDocType}
                onChange={(e) => setEditDocType(e.target.value ? Number(e.target.value) : "")}
                className="min-h-11 w-full rounded border-2 border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">— {text.letterDocumentType} —</option>
                {allDocTypes.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="min-h-11 rounded border-2 border-slate-300 bg-white px-4 font-bold text-slate-800 hover:bg-slate-50"
              >
                {text.editFields}
              </button>
              <button
                type="button"
                disabled={editSaving}
                onClick={() => void handleSaveEdit()}
                className="min-h-11 rounded bg-blue-700 px-5 font-bold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {editSaving ? text.saving : text.saveMetadata}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
