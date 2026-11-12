"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Field, Letter, Phase, apiBase, useSession } from "@/lib/useSession";
import { LanguageCode, MessageKey, messages } from "@/lib/i18n";
import letterLayoutJSON from "@/forms/letter.json";
import { FormLayout, parseFormLayout } from "@/lib/formLayouts";

const defaultLayout = parseFormLayout(letterLayoutJSON);

const fieldLabels: Record<keyof Letter, MessageKey> = {
  subject: "subject",
  myNumber: "myNumber",
  yourNumber: "yourNumber",
  date: "date",
  language: "language",
  from: "from",
  to: "to",
  signedBy: "signedBy",
  body: "body",
};

const workflow: { phase: number; label: MessageKey }[] = [
  { phase: 1, label: "stepQr" },
  { phase: 2, label: "stepPhone" },
  { phase: 3, label: "stepProcessing" },
  { phase: 4, label: "stepReview" },
  { phase: 5, label: "stepConfirmed" },
];

function stepForPhase(phase: Phase): number {
  if (phase === "captured") return 2;
  if (phase === "processing") return 3;
  if (phase === "review") return 4;
  if (phase === "confirmed" || phase === "saved") return 5;
  return 1;
}

function formatRemaining(expiresAt: Date | null, now: number): string {
  if (!expiresAt) return "--:--";
  const seconds = Math.max(0, Math.floor((expiresAt.getTime() - now) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function Confidence({ field, language }: { field: Field; language: LanguageCode }) {
  const text = messages[language];
  if (field.confidence < 55 || !field.value) {
    return (
      <span className="rounded bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-900">
        {field.confidence.toFixed(0)}% · {text.notDetected}
      </span>
    );
  }
  const high = field.confidence >= 80;
  return (
    <span
      className={`rounded px-2 py-1 text-[11px] font-bold ${
        high ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"
      }`}
    >
      {field.confidence.toFixed(0)}% · {high ? text.confidenceHigh : text.confidenceMedium}
    </span>
  );
}

export default function DocumentScanner({ layout = defaultLayout }: { layout?: FormLayout }) {
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [accessibility, setAccessibility] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [editableLetter, setEditableLetter] = useState<Letter | null>(null);
  const [confirmedByUser, setConfirmedByUser] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const session = useSession(language);
  const text = messages[language];
  const currentStep = stepForPhase(session.phase);
  const letter = editableLetter ?? session.letter;
  const remaining = formatRemaining(session.expiresAt, now);
  const isExpired = session.phase === "expired" || remaining === "00:00";

  useEffect(() => {
    const stored = window.localStorage.getItem("triscript-language");
    if (stored === "si" || stored === "ta" || stored === "en") setLanguage(stored);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("triscript-language", language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    document.documentElement.classList.toggle("a11y-large-text", accessibility);
  }, [accessibility]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isExpired && ["waiting", "captured", "processing"].includes(session.phase)) {
      session.setPhase("expired");
    }
  }, [isExpired, session.phase, session.setPhase]);

  useEffect(() => {
    if (session.letter) {
      setEditableLetter(session.letter);
      setConfirmedByUser(false);
      setSaveError("");
      setSaveSuccess(false);
    }
  }, [session.letter]);

  const statusText = useMemo(() => {
    if (session.phase === "captured") return text.capturedStatus;
    if (session.phase === "processing") return text.processingStatus;
    if (session.phase === "error") return text.errorTitle;
    if (session.phase === "expired" || isExpired) return text.sessionExpired;
    return text.waitingStatus;
  }, [isExpired, session.phase, text]);

  function updateField(key: keyof Letter, value: string) {
    setEditableLetter((current) => {
      const base = current ?? session.letter;
      if (!base) return current;
      return { ...base, [key]: { ...base[key], value } };
    });
  }

  function confirmDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!letter) return;
    setSaveError("");
    setConfirmedByUser(false);
    session.setPhase("confirmed");
  }

  async function saveLetter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmedByUser || !letter) {
      setSaveError(text.requiredConfirmation);
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch(`${apiBase}/api/letters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          formType: layout.id,
          fields: Object.fromEntries(layout.fields.map((key) => [key, letter[key]])),
        }),
      });
      if (response.status === 404 || response.status === 405 || response.status === 503) {
        setSaveError(`${text.saveUnavailable} (${response.status})`);
        return;
      }
      if (!response.ok) {
        setSaveError(`${text.saveFailed} (${response.status})`);
        return;
      }
      setSaveSuccess(true);
      session.setPhase("saved");
    } catch {
      setSaveError(text.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  function startOver() {
    setEditableLetter(null);
    setConfirmedByUser(false);
    setSaveError("");
    setSaveSuccess(false);
    session.restart();
  }

  const mainClasses = `min-h-screen bg-govBg text-govNavy ${accessibility ? "high-contrast text-lg" : ""}`;
  const labelClass = "block text-xs font-bold uppercase tracking-wider text-slate-700";
  const inputClass =
    "mt-1 min-h-11 w-full rounded border-2 border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-blue-700";

  return (
    <div className={mainClasses}>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-20 max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div aria-hidden="true" className="grid h-10 w-10 place-items-center rounded border border-blue-200 bg-blue-50 text-lg font-extrabold text-blue-800">
              T
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xl font-extrabold tracking-tight">TRISCRIPT</span>
                <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-700">
                  {text.version}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-600">{text.brandSubtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="interface-language" className="sr-only">{text.languageLabel}</label>
            <select
              id="interface-language"
              value={language}
              onChange={(event) => setLanguage(event.target.value as LanguageCode)}
              className="min-h-11 rounded-md border-2 border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
            >
              <option value="en">English (UK/LK)</option>
              <option value="si">සිංහල (Sinhala)</option>
              <option value="ta">தமிழ் (Tamil)</option>
            </select>
            <button
              type="button"
              aria-label={text.accessibility}
              aria-pressed={accessibility}
              onClick={() => setAccessibility((value) => !value)}
              className="min-h-11 rounded-md border-2 border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50"
            >
              {accessibility ? text.a11yEnhanced : text.a11yStandard}
            </button>
          </div>
        </div>
      </header>

      <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-950">
        <span className="mr-2 inline-flex rounded bg-amber-200 px-2 py-1 text-[11px] font-extrabold">{text.officialNotice}</span>
        {text.testNotice}
      </div>

      <nav aria-label={text.progressLabel} className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <ol className="mx-auto flex max-w-5xl items-center justify-between gap-2 overflow-x-auto text-xs font-medium sm:text-sm">
          {workflow.map((step, index) => (
            <li key={step.phase} className="flex shrink-0 items-center gap-2">
              <span
                aria-current={currentStep === step.phase ? "step" : undefined}
                className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                  currentStep >= step.phase ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-700"
                }`}
              >
                {step.phase}
              </span>
              <span className={currentStep === step.phase ? "font-bold text-slate-950" : "text-slate-600"}>
                {text[step.label]}
              </span>
              {index < workflow.length - 1 && <span aria-hidden="true" className="mx-1 h-0.5 w-5 bg-slate-300 sm:w-8" />}
            </li>
          ))}
        </ol>
      </nav>

      <p className="sr-only" aria-live="assertive" aria-atomic="true">{statusText}</p>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {session.phase === "connecting" || session.phase === "waiting" ? (
          <section aria-labelledby="scan-title" className="mx-auto max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="p-6 sm:p-8">
              <div className="mx-auto mb-8 max-w-2xl text-center">
                <h1 id="scan-title" className="text-2xl font-extrabold tracking-tight sm:text-3xl">{text[layout.titleKey]}</h1>
                <p className="mt-2 text-base leading-7 text-slate-700">{text[layout.introKey]}</p>
              </div>

              {session.phase === "connecting" ? (
                <div role="status" className="grid min-h-64 place-items-center border-y border-slate-200 py-10 text-center">
                  <p className="animate-pulse font-semibold text-blue-900">{text.waitingStatus}…</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 items-center gap-8 border-y border-slate-200 py-8 md:grid-cols-12">
                  <div className="flex flex-col items-center rounded-lg border-2 border-slate-200 bg-slate-50 p-6 text-center md:col-span-5">
                    <div className="rounded-lg border border-slate-300 bg-white p-3 shadow-sm">
                      {session.qr ? (
                        <img src={session.qr} width="288" height="288" alt={text.qrAlt} className="h-56 w-56 sm:h-64 sm:w-64" />
                      ) : (
                        <div className="grid h-56 w-56 place-items-center text-sm text-slate-600 sm:h-64 sm:w-64">{text.sessionErrorTitle}</div>
                      )}
                      <p className="mt-2 rounded bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-700">
                        {text.sessionId}: {session.id}
                      </p>
                    </div>
                    {session.phoneUrl && (
                      <div className="mt-3 max-w-full text-left">
                        <p className="text-xs font-bold text-slate-700">{text.phoneUrlLabel}</p>
                        <a
                          href={session.phoneUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block break-all text-xs text-blue-900 underline"
                        >
                          {text.openPhonePage}: {session.phoneUrl}
                        </a>
                        {new URL(session.phoneUrl).hostname === "localhost" && (
                          <p role="alert" className="mt-2 text-xs font-semibold text-red-900">{text.localhostWarning}</p>
                        )}
                      </div>
                    )}
                    <p className={`mt-4 rounded-full border px-3 py-2 font-mono text-sm ${isExpired ? "border-red-300 bg-red-50 text-red-900" : "border-slate-200 bg-white text-slate-900"}`}>
                      {text.expiresIn}: <strong>{remaining}</strong>
                    </p>
                  </div>

                  <div className="space-y-5 md:col-span-7">
                    {isExpired ? (
                      <div role="alert" className="space-y-3 rounded-r border-l-4 border-red-700 bg-red-50 p-4 text-red-950">
                        <h2 className="font-bold">{text.sessionExpired}</h2>
                        <button type="button" onClick={startOver} className="min-h-11 rounded bg-red-800 px-4 py-2 font-bold text-white hover:bg-red-900">
                          {text.startOver}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div role="status" className="rounded-r border-l-4 border-blue-700 bg-blue-50 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-blue-950">{text.waitingStatus}</span>
                            <span className="text-xs font-semibold text-blue-800">{text.statusReady}</span>
                          </div>
                          {session.errorMessage && (
                            <p role="alert" className="rounded border-l-4 border-amber-700 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
                              {session.errorMessage}
                            </p>
                          )}
                          <p className="mt-1 text-sm text-blue-900">{text.statusUpdated}</p>
                        </div>
                        <div className="space-y-3">
                          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">{text.phoneInstructions}</h2>
                          <ol className="space-y-3 text-sm leading-6 text-slate-800">
                            {[text.phoneStepOne, text.phoneStepTwo, text.phoneStepThree].map((instruction, index) => (
                              <li key={instruction} className="flex items-start gap-3">
                                <span className="grid h-7 w-7 shrink-0 place-items-center rounded border border-slate-300 bg-slate-100 font-bold">{index + 1}</span>
                                <span>{instruction}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-950">{text.noApp}</p>
                        <p className="text-xs leading-5 text-slate-600">{text.privacy}</p>
                        {process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_ENABLE_DEMO === "true" && session.qr && (
                          <a
                            href={session.phoneUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-11 items-center rounded bg-slate-800 px-4 py-2 text-sm font-bold text-white"
                          >
                            {text.devPhoneCapture}
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-col justify-between gap-2 text-xs text-slate-600 sm:flex-row">
                <span>{text.privacy}</span>
                <span className="font-mono">{text.sessionId}: {session.id || "—"}</span>
              </div>
            </div>
          </section>
        ) : session.phase === "captured" || session.phase === "processing" ? (
          <section aria-labelledby="processing-title" className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 id="processing-title" className="text-2xl font-extrabold">{text.processingTitle}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-700">{text.processingDescription}</p>
            <div role="status" className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-6 text-blue-950">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="h-4 w-4 animate-pulse rounded-full bg-blue-700" />
                <span className="font-bold">{statusText}</span>
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-blue-100">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-blue-700" />
              </div>
            </div>
            <p className="mt-5 text-sm text-slate-600">{text.privacy}</p>
          </section>
        ) : session.phase === "error" || session.phase === "expired" || isExpired ? (
          <section aria-labelledby="error-title" className="mx-auto max-w-3xl rounded-lg border border-red-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 id="error-title" className="text-2xl font-extrabold text-red-950">{text.errorTitle}</h1>
            <p role="alert" className="mt-3 rounded bg-red-50 p-4 text-sm leading-6 text-red-950">
              {session.phase === "expired" || isExpired ? text.sessionExpired : session.errorMessage || text.errorTitle}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={startOver} className="min-h-11 rounded bg-blue-700 px-5 py-2 font-bold text-white hover:bg-blue-800">{text.startOver}</button>
              <button type="button" onClick={startOver} className="min-h-11 rounded border-2 border-slate-300 bg-white px-5 py-2 font-bold text-slate-900 hover:bg-slate-50">{text.retake}</button>
            </div>
          </section>
        ) : session.phase === "review" && letter ? (
          <section aria-labelledby="review-title" className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-200 bg-slate-50 p-6 md:flex-row md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 id="review-title" className="text-2xl font-extrabold">{text.reviewTitle}</h1>
                  <span className="rounded border border-blue-200 bg-blue-100 px-2 py-1 text-xs font-bold text-blue-900">{text.stepReview}</span>
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">{text.reviewDescription}</p>
              </div>
              <button type="button" onClick={startOver} className="min-h-11 shrink-0 rounded border-2 border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100">
                {text.retake}
              </button>
            </div>

            <p className="border-b border-blue-200 bg-blue-50 px-6 py-3 text-sm font-medium leading-6 text-blue-950">{text.photoDeleted}</p>

            <form onSubmit={confirmDetails} className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-12 lg:divide-x lg:divide-y-0">
              <aside className="bg-slate-50 p-6 lg:col-span-5">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-700">{text.body}</h2>
                <div className="test-watermark min-h-72 rounded-lg border-2 border-slate-300 bg-white p-5 shadow-sm">
                  <p className="mb-4 border-b-2 border-red-200 pb-2 text-center text-sm font-extrabold text-red-800">{text.testNotice.split(" • ")[0]}</p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                    {letter.body.value || text.notDetected}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-600">
                  <span>{text.confidence}</span>
                  <Confidence field={letter.body} language={language} />
                </div>
              </aside>

              <div className="space-y-5 p-6 lg:col-span-7">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {layout.fields.filter((key) => key !== "body").map((key) => (
                    <div key={key} className={key === "subject" || key === "from" || key === "to" || key === "signedBy" ? "sm:col-span-2" : ""}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label htmlFor={`field-${key}`} className={labelClass}>{text[fieldLabels[key]]}</label>
                        <Confidence field={letter[key]} language={language} />
                      </div>
                      <input
                        id={`field-${key}`}
                        type="text"
                        autoComplete="off"
                        value={letter[key].value}
                        onChange={(event) => updateField(key, event.target.value)}
                        className={inputClass}
                        aria-describedby={`confidence-${key}`}
                      />
                      <span id={`confidence-${key}`} className="sr-only">
                        {text.confidence}: {letter[key].confidence.toFixed(0)} percent
                      </span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="field-body" className={labelClass}>{text.bodyHelp}</label>
                    <Confidence field={letter.body} language={language} />
                  </div>
                  <textarea
                    id="field-body"
                    rows={12}
                    value={letter.body.value}
                    onChange={(event) => updateField("body", event.target.value)}
                    className={`${inputClass} resize-y font-mono leading-6`}
                  />
                </div>
                <div className="flex flex-col justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center">
                  <p className="text-xs leading-5 text-slate-600">{text.reviewDescription}</p>
                  <button type="submit" className="min-h-12 shrink-0 rounded bg-blue-700 px-6 py-3 text-sm font-extrabold text-white shadow hover:bg-blue-800">
                    {text.confirmDetails}
                  </button>
                </div>
              </div>
            </form>
          </section>
        ) : (
          letter && (
            <section aria-labelledby="confirmed-title" className="mx-auto max-w-4xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className={`m-6 flex gap-4 rounded-lg border-2 p-5 ${saveSuccess ? "border-emerald-300 bg-emerald-50" : "border-blue-200 bg-blue-50"}`}>
                <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-extrabold text-white ${saveSuccess ? "bg-emerald-700" : "bg-blue-700"}`}>
                  {saveSuccess ? "✓" : "!"}
                </span>
                <div>
                  <h1 id="confirmed-title" className="text-xl font-extrabold">{saveSuccess ? text.savedTitle : text.confirmedTitle}</h1>
                  <p className="mt-1 text-sm leading-6">{saveSuccess ? text.savedDescription : text.confirmedDescription}</p>
                </div>
              </div>

              <div className="mx-6 overflow-hidden rounded-lg border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-100 px-5 py-3 font-bold">{text.stepConfirmed}</div>
                <dl className="divide-y divide-slate-200">
                  {layout.fields.map((key, index) => (
                    <div key={key} className={`grid grid-cols-1 gap-2 px-5 py-3 sm:grid-cols-3 ${index % 2 ? "bg-slate-50" : "bg-white"}`}>
                      <dt className="text-xs font-bold uppercase tracking-wide text-slate-600">{text[fieldLabels[key]]}</dt>
                      <dd className="whitespace-pre-wrap break-words text-sm font-medium text-slate-950 sm:col-span-2">{letter[key].value || text.notDetected}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="space-y-4 p-6">
                {saveError && <p id="save-error" role="alert" className="rounded border-l-4 border-red-700 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-950">{saveError}</p>}
                {!saveSuccess && (
                  <form onSubmit={(event) => void saveLetter(event)} className="space-y-4">
                    <label className="flex cursor-pointer items-start gap-3 rounded border border-slate-300 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-900">
                      <input
                        type="checkbox"
                        checked={confirmedByUser}
                        aria-invalid={saveError ? true : undefined}
                        aria-describedby={saveError ? "save-error" : undefined}
                        onChange={(event) => setConfirmedByUser(event.target.checked)}
                        className="mt-1 h-5 w-5 accent-blue-700"
                      />
                      <span>{text.confirmationCheckbox}</span>
                    </label>
                    <div className="flex flex-wrap justify-between gap-3">
                      <button type="button" onClick={() => { setSaveError(""); session.setPhase("review"); }} className="min-h-11 rounded border-2 border-slate-300 bg-white px-4 py-2 font-bold text-slate-800 hover:bg-slate-50">
                        {text.editFields}
                      </button>
                      <button type="submit" disabled={saving} className="min-h-11 rounded bg-blue-700 px-6 py-2 font-extrabold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70">
                        {saving ? text.saving : text.saveLetter}
                      </button>
                    </div>
                  </form>
                )}
                {saveSuccess && (
                  <button type="button" onClick={startOver} className="min-h-11 rounded bg-blue-700 px-5 py-2 font-bold text-white hover:bg-blue-800">
                    {text.newLetter}
                  </button>
                )}
              </div>
            </section>
          )
        )}
      </main>

      <footer className="mt-auto border-t border-slate-200 bg-white px-4 py-5 text-xs text-slate-600 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 sm:flex-row">
          <span><strong className="text-slate-950">TRISCRIPT</strong> · {text.footerTitle}</span>
          <div className="flex flex-col gap-2 sm:items-end">
            <Link href={layout.id === "letter" ? "/forms/leave-application" : "/"} className="font-semibold text-blue-800 underline">
              {layout.id === "letter" ? text.leaveApplicationDemo : text.backToLetterDemo}
            </Link>
            <span>{text.footerPrivacy}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
