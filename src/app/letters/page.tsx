"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import {
  deleteLetter,
  exportCsv,
  getLetters,
  updateLetter,
  type SavedLetter,
} from "@/lib/letterStore";
import { FIELD_KEYS, type FieldKey, type FieldValues } from "@/lib/types";

type View = "list" | "detail" | "edit";

export default function LettersPage() {
  const { t } = useI18n();
  const [letters, setLetters] = useState<SavedLetter[]>([]);
  const [view, setView] = useState<View>("list");
  const [selected, setSelected] = useState<SavedLetter | null>(null);
  const [editValues, setEditValues] = useState<FieldValues | null>(null);
  const [toast, setToast] = useState("");

  // Load from localStorage on mount
  useEffect(() => {
    setLetters(getLetters());
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function openDetail(letter: SavedLetter) {
    setSelected(letter);
    setView("detail");
  }

  function openEdit(letter: SavedLetter) {
    setSelected(letter);
    setEditValues({ ...letter.values });
    setView("edit");
  }

  function handleDelete(letter: SavedLetter) {
    if (!window.confirm(t.letters.deleteConfirm)) return;
    deleteLetter(letter.id);
    const updated = getLetters();
    setLetters(updated);
    if (view !== "list") setView("list");
    showToast(t.letters.deleted);
  }

  function handleSaveEdit() {
    if (!selected || !editValues) return;
    updateLetter(selected.id, editValues);
    const updated = getLetters();
    setLetters(updated);
    const refreshed = updated.find((l) => l.id === selected.id);
    if (refreshed) setSelected(refreshed);
    setView("detail");
    showToast(t.letters.saved);
  }

  function handleExportCsv() {
    const csv = exportCsv(letters);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `triscript-letters-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <SiteHeader />
      <main id="main" className="container page">

        {/* Toast notification */}
        {toast && (
          <div role="status" aria-live="polite" className="notice" style={{ maxWidth: "32rem" }}>
            ✓ {toast}
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {view === "list" && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
              <h1>{t.letters.title}</h1>
              {letters.length > 0 && (
                <div className="actions">
                  <button type="button" className="btn" onClick={handleExportCsv}>
                    ↓ {t.letters.exportCsv}
                  </button>
                  <Link href="/demo" className="btn btn-primary">
                    📷 {t.letters.scanNew}
                  </Link>
                </div>
              )}
            </div>

            {letters.length === 0 ? (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-state-icon" aria-hidden="true">📄</div>
                  <p>{t.letters.empty}</p>
                  <p className="muted">{t.letters.emptyHint}</p>
                  <div className="actions" style={{ justifyContent: "center", marginTop: "1rem" }}>
                    <Link href="/demo" className="btn btn-primary">
                      📷 {t.letters.scanNew}
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div className="table-wrap" style={{ borderRadius: "var(--radius-lg)", border: "none" }}>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t.letters.columns.date}</th>
                        <th scope="col">{t.letters.columns.subject}</th>
                        <th scope="col">{t.letters.columns.from}</th>
                        <th scope="col">{t.letters.columns.ref}</th>
                        <th scope="col"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {letters.map((l) => (
                        <tr key={l.id}>
                          <td style={{ whiteSpace: "nowrap" }}>{l.values.date || "–"}</td>
                          <td dir="auto">{l.values.subject || <span className="muted">{t.letters.noSubject}</span>}</td>
                          <td dir="auto">{l.values.from || "–"}</td>
                          <td style={{ whiteSpace: "nowrap" }}>{l.values.myNumber || "–"}</td>
                          <td>
                            <div className="actions" style={{ gap: "0.4rem", flexWrap: "nowrap" }}>
                              <button type="button" className="btn" style={{ minHeight: "36px", padding: "0.3rem 0.75rem", fontSize: "0.82rem" }} onClick={() => openDetail(l)}>
                                {t.letters.view}
                              </button>
                              <button type="button" className="btn" style={{ minHeight: "36px", padding: "0.3rem 0.75rem", fontSize: "0.82rem" }} onClick={() => openEdit(l)}>
                                ✎ {t.letters.edit}
                              </button>
                              <button type="button" className="btn" style={{ minHeight: "36px", padding: "0.3rem 0.75rem", fontSize: "0.82rem", color: "var(--danger)" }} onClick={() => handleDelete(l)}>
                                {t.letters.delete}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── DETAIL VIEW ── */}
        {view === "detail" && selected && (
          <>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setView("list")}>
                ← {t.letters.back}
              </button>
            </div>

            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.25rem" }}>
                <h1 style={{ fontSize: "clamp(1.25rem, 2.5vw, 1.6rem)", margin: 0 }} dir="auto">
                  {selected.values.subject || t.letters.noSubject}
                </h1>
                <div className="actions">
                  <button type="button" className="btn btn-primary" onClick={() => openEdit(selected)}>
                    ✎ {t.letters.edit}
                  </button>
                  <button type="button" className="btn" style={{ color: "var(--danger)" }} onClick={() => handleDelete(selected)}>
                    {t.letters.delete}
                  </button>
                </div>
              </div>

              <p className="muted" style={{ marginBottom: "1.25rem", fontSize: "0.82rem" }}>
                {new Date(selected.savedAt).toLocaleString()}
              </p>

              <dl className="saved-list">
                {FIELD_KEYS.map((k) => (
                  <div key={k}>
                    <dt>{t.fields[k]}</dt>
                    <dd dir="auto">{selected.values[k] || "–"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        )}

        {/* ── EDIT VIEW ── */}
        {view === "edit" && selected && editValues && (
          <>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setView(selected ? "detail" : "list")}>
                ← {t.letters.cancel}
              </button>
            </div>

            <div className="card">
              <h1 style={{ fontSize: "clamp(1.25rem, 2.5vw, 1.6rem)", marginBottom: "1.5rem" }}>
                ✎ {t.letters.editTitle}
              </h1>

              <EditForm
                values={editValues}
                onChange={setEditValues}
                onSave={handleSaveEdit}
                onCancel={() => setView("detail")}
                saveLabel={t.letters.saveChanges}
                cancelLabel={t.letters.cancel}
                fieldLabels={t.fields}
              />
            </div>
          </>
        )}

      </main>
      <SiteFooter />
    </>
  );
}

// ─── Edit form sub-component ─────────────────────────────────────────────────

function EditForm({
  values,
  onChange,
  onSave,
  onCancel,
  saveLabel,
  cancelLabel,
  fieldLabels,
}: {
  values: FieldValues;
  onChange: (v: FieldValues) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
  cancelLabel: string;
  fieldLabels: Record<FieldKey, string>;
}) {
  const baseId = useId();

  function change(key: FieldKey, value: string) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="review-form">
      <div className="fields-grid">
        {FIELD_KEYS.map((key) => {
          const id = `${baseId}-${key}`;
          return (
            <div className="field" key={key}>
              <label htmlFor={id}>{fieldLabels[key]}</label>
              {key === "body" ? (
                <textarea
                  id={id}
                  rows={6}
                  dir="auto"
                  value={values[key]}
                  onChange={(e) => change(key, e.target.value)}
                />
              ) : key === "language" ? (
                <select id={id} value={values[key]} onChange={(e) => change(key, e.target.value)}>
                  <option value="" />
                  <option value="si">Sinhala</option>
                  <option value="ta">Tamil</option>
                  <option value="en">English</option>
                  <option value="mixed">Mixed</option>
                </select>
              ) : (
                <input
                  id={id}
                  type="text"
                  dir="auto"
                  value={values[key]}
                  inputMode={key === "date" ? "numeric" : undefined}
                  placeholder={key === "date" ? "YYYY-MM-DD" : undefined}
                  onChange={(e) => change(key, e.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="actions" style={{ marginTop: "1.25rem" }}>
        <button type="button" className="btn btn-primary" onClick={onSave}>
          ✓ {saveLabel}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
