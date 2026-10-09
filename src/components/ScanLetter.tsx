"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { readLetter } from "@/lib/reader";
import { fmt } from "@/lib/i18n";
import {
  emptyFields,
  type FieldValues,
  type ReadResult,
  type SessionInfo,
} from "@/lib/types";
import { useI18n } from "./I18nProvider";
import { ReviewForm } from "./ReviewForm";

/**
 * <ScanLetter /> is the reusable piece: drop it into any screen where a person
 * enters a letter. It pairs a phone by QR code, receives the photo, reads it,
 * lets the person check and correct every field, and calls onConfirm with the
 * confirmed values. It never calls onConfirm without the person pressing Save.
 */

type Stage = "idle" | "starting" | "pairing" | "reading" | "review" | "saved" | "expired" | "error";
type ErrorKind = "pair" | "read";

const POLL_MS = 1500;

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ScanLetter({ onConfirm }: { onConfirm: (values: FieldValues) => void }) {
  const { t, lang } = useI18n();
  const [stage, setStage] = useState<Stage>("idle");
  const [errorKind, setErrorKind] = useState<ErrorKind>("pair");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [qr, setQr] = useState("");
  const [captureUrl, setCaptureUrl] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ReadResult | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const photoBlobRef = useRef<Blob | null>(null);
  const photoUrlRef = useRef<string | null>(null);

  const closeSession = useCallback(() => {
    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    if (id) {
      fetch(`/api/session/${id}`, { method: "DELETE", keepalive: true }).catch(() => {});
    }
  }, []);

  const dropPhoto = useCallback(() => {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = null;
    photoBlobRef.current = null;
    setPhotoUrl(null);
  }, []);

  // Delete the session and photo if the person leaves.
  useEffect(() => {
    const onHide = () => closeSession();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      closeSession();
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    };
  }, [closeSession]);

  const runReader = useCallback(
    async (blob: Blob) => {
      setStage("reading");
      try {
        const r = await readLetter(blob, lang);
        setResult(r);
        setStage("review");
      } catch {
        setErrorKind("read");
        setStage("error");
      }
    },
    [lang],
  );

  const receivePhoto = useCallback(
    async (id: string) => {
      setStage("reading");
      try {
        const res = await fetch(`/api/session/${id}/photo`, { cache: "no-store" });
        if (!res.ok) throw new Error("photo");
        const blob = await res.blob();
        photoBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        photoUrlRef.current = url;
        setPhotoUrl(url);
        await runReader(blob);
      } catch {
        setErrorKind("read");
        setStage("error");
      }
    },
    [runReader],
  );

  const start = useCallback(async () => {
    closeSession();
    dropPhoto();
    setResult(null);
    setStage("starting");
    try {
      const res = await fetch("/api/session", { method: "POST", cache: "no-store" });
      if (!res.ok) throw new Error("session");
      const info = (await res.json()) as SessionInfo;
      const base = (process.env.NEXT_PUBLIC_PUBLIC_URL || window.location.origin).replace(/\/$/, "");
      const url = `${base}/capture/${info.id}`;
      const dataUrl = await QRCode.toDataURL(url, { margin: 2, width: 288, errorCorrectionLevel: "M" });
      sessionIdRef.current = info.id;
      setSession(info);
      setCaptureUrl(url);
      setQr(dataUrl);
      setNow(Date.now());
      setStage("pairing");
    } catch {
      setErrorKind("pair");
      setStage("error");
    }
  }, [closeSession, dropPhoto]);

  // While pairing: tick the countdown and poll for the photo.
  useEffect(() => {
    if (stage !== "pairing" || !session) return;
    let cancelled = false;
    let busy = false;

    const tick = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= session.expiresAt) {
        closeSession();
        setStage("expired");
      }
    }, 1000);

    const poll = setInterval(async () => {
      if (busy || cancelled) return;
      busy = true;
      try {
        const res = await fetch(`/api/session/${session.id}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 404) {
          setStage("expired");
          return;
        }
        if (res.ok) {
          const json = (await res.json()) as { status: "waiting" | "photo" };
          if (json.status === "photo") {
            cancelled = true;
            void receivePhoto(session.id);
          }
        }
      } catch {
        /* weak connection: try again on the next poll */
      } finally {
        busy = false;
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [stage, session, receivePhoto, closeSession]);

  function typeInstead() {
    closeSession();
    dropPhoto();
    setResult({ fields: emptyFields(), demo: false });
    setStage("review");
  }

  function reset() {
    closeSession();
    dropPhoto();
    setResult(null);
    setSession(null);
    setStage("idle");
  }

  function save(values: FieldValues) {
    onConfirm(values);
    closeSession(); // the photo is deleted on the server here
    dropPhoto();
    setStage("saved");
  }

  const remaining = session ? session.expiresAt - now : 0;

  return (
    <section className="card scan" aria-labelledby="scan-title">
      <h2 id="scan-title" className="sr-only">
        {t.pair.title}
      </h2>

      {stage === "idle" && (
        <div className="stack">
          <p>{t.pair.instruction}</p>
          <p className="muted">{t.pair.networkHint}</p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={start}>
              {t.pair.start}
            </button>
            <button type="button" className="btn" onClick={typeInstead}>
              {t.pair.manual}
            </button>
          </div>
        </div>
      )}

      {stage === "starting" && (
        <p role="status" className="status">
          <span className="spinner" aria-hidden="true" /> {t.pair.starting}
        </p>
      )}

      {stage === "pairing" && session && (
        <div className="pairing">
          <div className="qr-box">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} width={288} height={288} alt={t.pair.qrAlt} />
          </div>
          <div className="stack">
            <p>{t.pair.instruction}</p>
            <p className="countdown" aria-live="off">
              {fmt(t.pair.expiresIn, { time: formatTime(remaining) })}
            </p>
            <p role="status" className="status">
              <span className="spinner" aria-hidden="true" /> {t.pair.waiting}
            </p>
            <details>
              <summary>{t.pair.linkLabel}</summary>
              <p className="link-text" dir="ltr">
                {captureUrl}
              </p>
            </details>
            <p className="muted">{t.pair.networkHint}</p>
            <div className="actions">
              <button type="button" className="btn" onClick={reset}>
                {t.pair.cancel}
              </button>
              <button type="button" className="btn" onClick={typeInstead}>
                {t.pair.manual}
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === "expired" && (
        <div className="stack" role="alert">
          <p>{t.pair.expired}</p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={start}>
              {t.pair.newCode}
            </button>
            <button type="button" className="btn" onClick={typeInstead}>
              {t.pair.manual}
            </button>
          </div>
        </div>
      )}

      {stage === "reading" && (
        <div className="stack">
          <p role="status" className="status">
            <span className="spinner" aria-hidden="true" /> {t.review.reading}
          </p>
          <p className="muted">{t.review.readingHint}</p>
          {photoUrl && (
            <figure className="review-photo small">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt={t.review.photoAlt} />
            </figure>
          )}
        </div>
      )}

      {stage === "error" && (
        <div className="stack" role="alert">
          <p className="error-text">
            {errorKind === "read" ? t.review.error : t.capture.error}
          </p>
          {errorKind === "read" && <p>{t.review.errorBody}</p>}
          <div className="actions">
            {errorKind === "read" && photoBlobRef.current ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => photoBlobRef.current && runReader(photoBlobRef.current)}
              >
                {t.review.retry}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={start}>
                {t.capture.tryAgain}
              </button>
            )}
            <button type="button" className="btn" onClick={typeInstead}>
              {t.pair.manual}
            </button>
          </div>
        </div>
      )}

      {stage === "review" && result && (
        <ReviewForm result={result} photoUrl={photoUrl} onSave={save} onStartOver={reset} />
      )}

      {stage === "saved" && (
        <div className="stack" role="status">
          <h3>✓ {t.review.saved}</h3>
          <p>{t.review.savedBody}</p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={start}>
              {t.review.scanAnother}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
