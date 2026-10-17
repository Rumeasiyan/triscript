"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { fmt } from "@/lib/i18n";
import { preparePhoto } from "@/lib/image";

type Phase =
  | "checking"
  | "ready"
  | "preparing"
  | "preview"
  | "sending"
  | "sent-page"   // one page sent, can add more
  | "sent"        // all done
  | "gone"
  | "error";

const MAX_ATTEMPTS = 4;
const MAX_PAGES = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function CapturePage() {
  const { t } = useI18n();
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const [phase, setPhase] = useState<Phase>("checking");
  const [attempt, setAttempt] = useState(1);
  const [pagesSent, setPagesSent] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Is the link still good?
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/session/${sessionId}`, { cache: "no-store" });
        if (!alive) return;
        if (res.status === 404) return setPhase("gone");
        if (!res.ok) return setPhase("error");
        const json = (await res.json()) as { status: "waiting" | "photo"; photoCount: number };
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
    return () => {
      alive = false;
    };
  }, [sessionId]);

  // Move focus to the heading when the screen changes.
  useEffect(() => {
    headingRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setPhase("preparing");
    // Single-pass: resize + enhance in one canvas to minimise memory use
    const blob = await preparePhoto(file);
    blobRef.current = blob;
    setPreviewUrl(URL.createObjectURL(blob));
    setPhase("preview");
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const retake = useCallback(() => {
    blobRef.current = null;
    setPreviewUrl(null);
    setPhase(pagesSent > 0 ? "sent-page" : "ready");
  }, [pagesSent]);

  const send = useCallback(async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setPhase("sending");
    for (let n = 1; n <= MAX_ATTEMPTS; n++) {
      setAttempt(n);
      try {
        const res = await fetch(`/api/session/${sessionId}/photo`, {
          method: "POST",
          headers: { "Content-Type": blob.type || "image/jpeg" },
          body: blob,
        });
        if (res.status === 204) {
          blobRef.current = null;
          setPreviewUrl(null);
          const next = pagesSent + 1;
          setPagesSent(next);
          setPhase(next >= MAX_PAGES ? "sent" : "sent-page");
          return;
        }
        if (res.status === 409) {
          // Too many pages or duplicate — treat as done
          setPhase("sent");
          return;
        }
        if (res.status === 404) return setPhase("gone");
        if (res.status === 413 || res.status === 415) return setPhase("error");
        throw new Error(String(res.status));
      } catch {
        if (n < MAX_ATTEMPTS) await sleep(1000 * n);
      }
    }
    setPhase("error");
  }, [sessionId, pagesSent]);

  const finish = useCallback(() => {
    setPhase("sent");
  }, []);

  const takeAnother = useCallback(() => {
    setPhase("ready");
  }, []);

  return (
    <>
      <SiteHeader minimal />
      <main id="main" className="container page capture">

        {phase === "checking" && (
          <p role="status" className="status">
            <span className="spinner" aria-hidden="true" /> {t.capture.checking}
          </p>
        )}

        {(phase === "ready" || phase === "preparing") && (
          <div className="stack">
            <h1 ref={headingRef} tabIndex={-1}>
              {t.capture.title}
            </h1>
            <p className="lead">{t.capture.intro}</p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <button
              type="button"
              className="btn btn-primary btn-big"
              disabled={phase === "preparing"}
              onClick={() => inputRef.current?.click()}
            >
              📷 {t.capture.take}
            </button>
            {phase === "preparing" && (
              <p role="status" className="status">
                <span className="spinner" aria-hidden="true" /> {t.pair.starting}
              </p>
            )}
          </div>
        )}

        {phase === "preview" && previewUrl && (
          <div className="stack">
            <h1 ref={headingRef} tabIndex={-1}>
              {t.capture.title}
            </h1>
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
            <h1 ref={headingRef} tabIndex={-1} className="sr-only">
              {t.capture.sending}
            </h1>
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
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary btn-big"
                onClick={() => inputRef.current?.click()}
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
            <h1 ref={headingRef} tabIndex={-1}>
              ✓ {t.capture.sent}
            </h1>
            <p className="lead">{t.capture.sentHint}</p>
          </div>
        )}

        {phase === "gone" && (
          <div className="stack" role="alert">
            <h1 ref={headingRef} tabIndex={-1}>
              {t.capture.expiredTitle}
            </h1>
            <p className="lead">{t.capture.notFound}</p>
            <p className="muted">{t.capture.expiredBody}</p>
          </div>
        )}

        {phase === "error" && (
          <div className="stack" role="alert">
            <h1 ref={headingRef} tabIndex={-1}>
              {t.capture.error}
            </h1>
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary btn-big"
                onClick={() => (blobRef.current ? void send() : takeAnother())}
              >
                {t.capture.tryAgain}
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
