"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { fmt } from "@/lib/i18n";

type Phase =
  | "checking"
  | "ready"
  | "preview"
  | "sending"
  | "sent-page"
  | "sent"
  | "gone"
  | "error";

const MAX_ATTEMPTS = 4;
const MAX_PAGES = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function CapturePage() {
  const { t } = useI18n();
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const [phase, setPhase] = useState<Phase>("checking");
  const [attempt, setAttempt] = useState(1);
  const [pagesSent, setPagesSent] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Two inputs: one with capture (opens camera), one without (opens file picker)
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<File | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/session/${sessionId}`, { cache: "no-store" });
        if (!alive) return;
        if (res.status === 404) return setPhase("gone");
        if (!res.ok) return setPhase("error");
        const json = (await res.json()) as { status: string; photoCount: number };
        if (json.status === "photo") {
          setPagesSent(json.photoCount);
          setPhase(json.photoCount >= MAX_PAGES ? "sent" : "sent-page");
        } else {
          setPhase("ready");
        }
      } catch {
        if (alive) setPhase("error");
      }
    })();
    return () => { alive = false; };
  }, [sessionId]);

  useEffect(() => { headingRef.current?.focus(); }, [phase]);

  useEffect(() => {
    if (phase !== "preview" && previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setPreviewUrl(null);
    }
  }, [phase]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const onFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setPhase("error"); return; }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    fileRef.current = file;
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setPhase("preview");
    // Reset both inputs
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }, []);

  const retake = useCallback(() => {
    fileRef.current = null;
    setPhase(pagesSent > 0 ? "sent-page" : "ready");
  }, [pagesSent]);

  const send = useCallback(async () => {
    const file = fileRef.current;
    if (!file) return;
    setPhase("sending");
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setPreviewUrl(null);
    }
    const contentType = file.type || "image/jpeg";
    for (let n = 1; n <= MAX_ATTEMPTS; n++) {
      setAttempt(n);
      try {
        const res = await fetch(`/api/session/${sessionId}/photo`, {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: file,
        });
        if (res.status === 204) {
          fileRef.current = null;
          const next = pagesSent + 1;
          setPagesSent(next);
          setPhase(next >= MAX_PAGES ? "sent" : "sent-page");
          return;
        }
        if (res.status === 409) { setPhase("sent"); return; }
        if (res.status === 404) { setPhase("gone"); return; }
        if (res.status === 413 || res.status === 415) { setPhase("error"); return; }
        throw new Error(String(res.status));
      } catch {
        if (n < MAX_ATTEMPTS) await sleep(1000 * n);
      }
    }
    setPhase("error");
  }, [sessionId, pagesSent]);

  const finish = useCallback(() => setPhase("sent"), []);

  // Two hidden inputs rendered once, reused across phases
  const inputs = (
    <>
      {/* Primary: opens native camera directly */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {/* Fallback: opens file picker (camera + gallery) for low-memory phones */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </>
  );

  return (
    <>
      <SiteHeader minimal />
      <main id="main" className="container page capture">

        {phase === "checking" && (
          <p role="status" className="status">
            <span className="spinner" aria-hidden="true" /> {t.capture.checking}
          </p>
        )}

        {phase === "ready" && (
          <div className="stack">
            <h1 ref={headingRef} tabIndex={-1}>{t.capture.title}</h1>
            <p className="lead">{t.capture.intro}</p>
            {inputs}
            <button
              type="button"
              className="btn btn-primary btn-big"
              onClick={() => cameraInputRef.current?.click()}
            >
              📷 {t.capture.take}
            </button>
            {/* Low-memory fallback — shown below the main button */}
            <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
              {t.capture.lowMemoryHint}{" "}
              <button
                type="button"
                className="btn-ghost"
                style={{ font: "inherit", fontSize: "0.85rem", padding: "0", border: "0", cursor: "pointer", color: "var(--primary)", background: "none", textDecoration: "underline" }}
                onClick={() => galleryInputRef.current?.click()}
              >
                {t.capture.lowMemoryAction}
              </button>
            </p>
          </div>
        )}

        {phase === "preview" && previewUrl && (
          <div className="stack">
            <h1 ref={headingRef} tabIndex={-1}>{t.capture.title}</h1>
            <figure className="capture-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt={t.capture.previewAlt} />
            </figure>
            <p>{t.capture.checkPhoto}</p>
            <div className="actions">
              <button type="button" className="btn btn-primary btn-big" onClick={send}>
                {t.capture.use}
              </button>
              <button type="button" className="btn btn-big" onClick={retake}>
                {t.capture.retake}
              </button>
            </div>
          </div>
        )}

        {phase === "sending" && (
          <div className="stack">
            <h1 ref={headingRef} tabIndex={-1} className="sr-only">{t.capture.sending}</h1>
            <p role="status" className="status">
              <span className="spinner" aria-hidden="true" />{" "}
              {attempt > 1
                ? fmt(t.capture.retrying, { n: attempt, max: MAX_ATTEMPTS })
                : t.capture.sending}
            </p>
          </div>
        )}

        {phase === "sent-page" && (
          <div className="stack">
            <h1 ref={headingRef} tabIndex={-1}>
              ✓ {fmt(t.capture.pageSent, { n: pagesSent })}
            </h1>
            <p className="lead">{t.capture.addPagePrompt}</p>
            {inputs}
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary btn-big"
                onClick={() => cameraInputRef.current?.click()}
              >
                📷 {t.capture.addPage}
              </button>
              <button type="button" className="btn btn-big" onClick={finish}>
                {t.capture.doneAddingPages}
              </button>
            </div>
          </div>
        )}

        {phase === "sent" && (
          <div className="stack" role="status">
            <h1 ref={headingRef} tabIndex={-1}>✓ {t.capture.sent}</h1>
            <p className="lead">{t.capture.sentHint}</p>
          </div>
        )}

        {phase === "gone" && (
          <div className="stack" role="alert">
            <h1 ref={headingRef} tabIndex={-1}>{t.capture.expiredTitle}</h1>
            <p className="lead">{t.capture.notFound}</p>
            <p className="muted">{t.capture.expiredBody}</p>
          </div>
        )}

        {phase === "error" && (
          <div className="stack" role="alert">
            <h1 ref={headingRef} tabIndex={-1}>{t.capture.error}</h1>
            <p className="muted">{t.capture.errorHint}</p>
            {inputs}
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary btn-big"
                onClick={() => fileRef.current ? void send() : cameraInputRef.current?.click()}
              >
                {t.capture.tryAgain}
              </button>
              <button
                type="button"
                className="btn btn-big"
                onClick={() => galleryInputRef.current?.click()}
              >
                {t.capture.lowMemoryAction}
              </button>
            </div>
          </div>
        )}

      </main>
    </>
  );
}
