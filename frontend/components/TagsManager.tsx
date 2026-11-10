"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { messages } from "@/lib/i18n";
import type { LanguageCode } from "@/lib/i18n";
import { type Tag, createTag, deleteTag, listTags, updateTag } from "@/lib/metaApi";

const DEFAULT_COLOUR = "#6366f1";
const COLOUR_RE = /^#[0-9a-fA-F]{6}$/;

export default function TagsManager() {
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add form state
  const [newName, setNewName] = useState("");
  const [newColour, setNewColour] = useState(DEFAULT_COLOUR);
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  // Edit form state
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColour, setEditColour] = useState(DEFAULT_COLOUR);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  const text = messages[language];

  useEffect(() => {
    const stored = window.localStorage.getItem("triscript-language");
    if (stored === "si" || stored === "ta" || stored === "en") setLanguage(stored as LanguageCode);
  }, []);

  useEffect(() => {
    setLoading(true);
    listTags()
      .then(setTags)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError("");
    if (!newName.trim()) { setAddError(text.tagNameRequired); return; }
    if (!COLOUR_RE.test(newColour)) { setAddError(text.tagColourRequired); return; }
    setAdding(true);
    try {
      const tag = await createTag(newName.trim(), newColour);
      setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setNewColour(DEFAULT_COLOUR);
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  function startEdit(tag: Tag) {
    setEditId(tag.id);
    setEditName(tag.name);
    setEditColour(tag.colour);
    setEditError("");
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (editId == null) return;
    setEditError("");
    if (!editName.trim()) { setEditError(text.tagNameRequired); return; }
    if (!COLOUR_RE.test(editColour)) { setEditError(text.tagColourRequired); return; }
    setSaving(true);
    try {
      const updated = await updateTag(editId, editName.trim(), editColour);
      setTags((prev) =>
        prev.map((t) => (t.id === editId ? updated : t)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditId(null);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm(text.confirmDeleteTag)) return;
    try {
      await deleteTag(id);
      setTags((prev) => prev.filter((t) => t.id !== id));
      if (editId === id) setEditId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const inputClass = "min-h-11 rounded border-2 border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-blue-700";
  const btnPrimary = "min-h-11 rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60";
  const btnSecondary = "min-h-11 rounded border-2 border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50";

  return (
    <div className="min-h-screen bg-slate-50 text-govNavy">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {/* Nav */}
        <div className="mb-6 flex items-center gap-2 text-sm">
          <Link href="/organisation" className="text-blue-800 underline">{text.manageOrganisation}</Link>
          <span className="text-slate-400">›</span>
          <span className="font-semibold">{text.tagsTitle}</span>
        </div>

        <h1 className="text-2xl font-extrabold">{text.tagsTitle}</h1>
        <p className="mt-1 text-sm text-slate-600">{text.tagsDescription}</p>

        {/* Language selector */}
        <div className="mt-4">
          <label htmlFor="lang" className="sr-only">{text.languageLabel}</label>
          <select
            id="lang"
            value={language}
            onChange={(e) => setLanguage(e.target.value as LanguageCode)}
            className="rounded border-2 border-slate-300 bg-white px-3 py-2 text-sm font-semibold"
          >
            <option value="en">English</option>
            <option value="si">සිංහල</option>
            <option value="ta">தமிழ்</option>
          </select>
        </div>

        {/* Add form */}
        <form onSubmit={(e) => void handleAdd(e)} className="mt-6 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold">{text.addTag}</h2>
          {addError && <p role="alert" className="text-sm font-semibold text-red-900">{addError}</p>}
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              aria-label={text.tagName}
              placeholder={text.tagName}
              value={newName}
              maxLength={64}
              onChange={(e) => setNewName(e.target.value)}
              className={`${inputClass} flex-1`}
            />
            <div className="flex items-center gap-2">
              <label htmlFor="new-colour" className="text-sm font-semibold text-slate-700">{text.tagColour}</label>
              <input
                id="new-colour"
                type="color"
                value={newColour}
                onChange={(e) => setNewColour(e.target.value)}
                className="h-11 w-14 cursor-pointer rounded border-2 border-slate-300 bg-white p-1"
              />
            </div>
            <button type="submit" disabled={adding} className={btnPrimary}>
              {text.addTag}
            </button>
          </div>
        </form>

        {/* List */}
        <div className="mt-6">
          {loading ? (
            <p className="text-sm text-slate-600">Loading…</p>
          ) : error ? (
            <p role="alert" className="text-sm font-semibold text-red-900">{error}</p>
          ) : tags.length === 0 ? (
            <p className="text-sm text-slate-600">{text.noTags}</p>
          ) : (
            <ul className="space-y-2">
              {tags.map((tag) => (
                <li key={tag.id} className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  {editId === tag.id ? (
                    <form onSubmit={(e) => void handleSave(e)} className="flex flex-wrap items-center gap-3 p-4">
                      {editError && <p role="alert" className="w-full text-sm font-semibold text-red-900">{editError}</p>}
                      <input
                        type="text"
                        aria-label={text.tagName}
                        value={editName}
                        maxLength={64}
                        onChange={(e) => setEditName(e.target.value)}
                        className={`${inputClass} flex-1`}
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-semibold text-slate-700">{text.tagColour}</label>
                        <input
                          type="color"
                          value={editColour}
                          onChange={(e) => setEditColour(e.target.value)}
                          className="h-11 w-14 cursor-pointer rounded border-2 border-slate-300 bg-white p-1"
                        />
                      </div>
                      <button type="submit" disabled={saving} className={btnPrimary}>{text.saveTag}</button>
                      <button type="button" onClick={() => setEditId(null)} className={btnSecondary}>{text.editFields}</button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span
                        className="h-5 w-5 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.colour }}
                        aria-hidden="true"
                      />
                      <span className="flex-1 font-semibold">{tag.name}</span>
                      <span className="font-mono text-xs text-slate-500">{tag.colour}</span>
                      <button
                        type="button"
                        onClick={() => startEdit(tag)}
                        className="text-sm font-semibold text-blue-800 underline"
                      >
                        {text.editTag}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(tag.id)}
                        className="text-sm font-semibold text-red-700 underline"
                      >
                        {text.deleteTag}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
