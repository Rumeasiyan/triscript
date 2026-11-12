"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { messages } from "@/lib/i18n";
import type { LanguageCode } from "@/lib/i18n";
import {
  type Correspondent,
  createCorrespondent,
  deleteCorrespondent,
  listCorrespondents,
  updateCorrespondent,
} from "@/lib/metaApi";

export default function CorrespondentsManager() {
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [items, setItems] = useState<Correspondent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  const text = messages[language];

  useEffect(() => {
    const stored = window.localStorage.getItem("triscript-language");
    if (stored === "si" || stored === "ta" || stored === "en") setLanguage(stored as LanguageCode);
  }, []);

  useEffect(() => {
    setLoading(true);
    listCorrespondents()
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError("");
    if (!newName.trim()) { setAddError(text.correspondentNameRequired); return; }
    setAdding(true);
    try {
      const created = await createCorrespondent(newName.trim());
      setItems((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (editId == null) return;
    setEditError("");
    if (!editName.trim()) { setEditError(text.correspondentNameRequired); return; }
    setSaving(true);
    try {
      const updated = await updateCorrespondent(editId, editName.trim());
      setItems((prev) =>
        prev.map((c) => (c.id === editId ? updated : c)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditId(null);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm(text.confirmDeleteCorrespondent)) return;
    try {
      await deleteCorrespondent(id);
      setItems((prev) => prev.filter((c) => c.id !== id));
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
        <div className="mb-6 flex items-center gap-2 text-sm">
          <Link href="/organisation" className="text-blue-800 underline">{text.manageOrganisation}</Link>
          <span className="text-slate-400">›</span>
          <span className="font-semibold">{text.correspondentsTitle}</span>
        </div>

        <h1 className="text-2xl font-extrabold">{text.correspondentsTitle}</h1>
        <p className="mt-1 text-sm text-slate-600">{text.correspondentsDescription}</p>

        <div className="mt-4">
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

        {/* Add form */}
        <form onSubmit={(e) => void handleAdd(e)} className="mt-6 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold">{text.addCorrespondent}</h2>
          {addError && <p role="alert" className="text-sm font-semibold text-red-900">{addError}</p>}
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              aria-label={text.correspondentName}
              placeholder={text.correspondentName}
              value={newName}
              maxLength={128}
              onChange={(e) => setNewName(e.target.value)}
              className={`${inputClass} flex-1`}
            />
            <button type="submit" disabled={adding} className={btnPrimary}>{text.addCorrespondent}</button>
          </div>
          <p className="text-xs text-slate-600">{text.suggestedCorrespondent}</p>
        </form>

        {/* List */}
        <div className="mt-6">
          {loading ? (
            <p className="text-sm text-slate-600">Loading…</p>
          ) : error ? (
            <p role="alert" className="text-sm font-semibold text-red-900">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-600">{text.noCorrespondents}</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  {editId === item.id ? (
                    <form onSubmit={(e) => void handleSave(e)} className="flex flex-wrap items-center gap-3 p-4">
                      {editError && <p role="alert" className="w-full text-sm font-semibold text-red-900">{editError}</p>}
                      <input
                        type="text"
                        aria-label={text.correspondentName}
                        value={editName}
                        maxLength={128}
                        onChange={(e) => setEditName(e.target.value)}
                        className={`${inputClass} flex-1`}
                        autoFocus
                      />
                      <button type="submit" disabled={saving} className={btnPrimary}>{text.saveCorrespondent}</button>
                      <button type="button" onClick={() => setEditId(null)} className={btnSecondary}>{text.editFields}</button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="flex-1 font-semibold">{item.name}</span>
                      <button type="button" onClick={() => { setEditId(item.id); setEditName(item.name); setEditError(""); }} className="text-sm font-semibold text-blue-800 underline">
                        {text.editCorrespondent}
                      </button>
                      <button type="button" onClick={() => void handleDelete(item.id)} className="text-sm font-semibold text-red-700 underline">
                        {text.deleteCorrespondent}
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
