"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmt } from "@/lib/i18n";
import {
  FORM_TYPES,
  emptyFormValues,
  type FormReadResult,
  type FormType,
  type FormValues,
} from "@/lib/forms";
import type { SessionInfo } from "@/lib/types";
import { useI18n } from "./I18nProvider";

/**
 * <ScanForm /> — reusable component for scanning a paper form.
 *
 * Props:
 *   formTypeId  – one of the registered form type IDs
 *   onConfirm   – called with the confirmed field values after the person saves
 *
 * Works the same as <ScanLetter />: QR code → phone captures → reader fills in
 * fields → person checks → onConfirm.
 */

type Stage =
  | "idle"
  | "starting"
  | "pairing"
  | "photo-received"
  | "reading"
  | "review"
  | "saved"
  | "expired"
  | "error";

type ErrorKind = "pair" | "read";
const POLL_MS = 1500;

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  formTypeId: string;
  onConfirm: (values: FormValues) => void;
}

export function ScanForm({ formTypeId, onConfirm }: Props) {
  const { t, lang } = useI18n();
  const formType: FormType | undefined = FORM_TYPES[formTypeId];

  const [stage, setStage] = useState<Stage>("idle");
  const [errorKind, setErrorKind] = useState<ErrorKind>("pair");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [qr, setQr] = useState("");
  const [captureUrl, setCaptureUrl] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [result, setResult] = useState<FormReadResult | null>(null);
  const [editedValues, setEditedValues] = useState<FormValues>({});

  const sessionIdRef = useRef<string | null>(null);
  const photoBlobsRef = useRef<Blob[]>([]);
  const photoUrlRef = useRef<string | null>(null);

  const closeSession = useCallback(() => {
    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    if (id) {
      fetch(`/api/session/${id}`, { method: "DELETE", keepalive: true }).catch(() => {});
    }
  }, []);

  const dropPhotos = useCallback(() => {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = null;
    photoBlobsRef.current = [];
    setPhotoUrl(null);
    setPhotoCount(0);
  }, []);

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
    async (blobs: Blob[]) => {
      if (!formType) return;
      setStage("reading");
      try {
        const image = blobs[0]; // forms are usually single-page
        const body = new FormData();
        body.append("image", image, "form.jpg");
        body.append("formId", formTypeId);
        body.append("uiLang", lang);
        const res = await fetch("/api/read/form", { method: "POST", body, cache: "no-store" });
        if (!res.ok) throw new Error(`Reader replied ${res.status}`);
        const r = (await res.json()) as FormReadResult;
        setResult(r);
        setEditedValues({ ...r.values });
        setStage("review");
      } catch {
        setErrorKind("read");
        setStage("error");
      }
    },
    [lang, formTypeId, formType],
  );

  const receivePhotos = useCallback(
    async (id: string, count: number) => {
      setStage("reading");
      try {
        const blobs: Blob[] = [];
        for (let page = 1; page <= count; page++) {
          const res = await fetch(`/api/session/${id}/photo?page=${page}`, { cache: "no-store" });
          if (!res.ok) break;
          blobs.push(await res.blob());
        }
        if (blobs.length === 0) throw new Error("no photos");
        photoBlobsRef.current = blobs;
        const url = URL.createObjectURL(blobs[0]);
        photoUrlRef.current = url;
        setPhotoUrl(url);
        await runReader(blobs);
      } catch {
        setErrorKind("read");
        setStage("error");
      }
    },
    [runReader],
  );

  const start = useCallback(async () => {
    closeSession();
    dropPhotos();
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
  }, [closeSession, dropPhotos]);

  // Countdown + poll while pairing
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
        if (res.status === 404) { setStage("expired"); return; }
        if (res.ok) {
          const json = (await res.json()) as { status: "waiting" | "photo"; photoCount: number };
          if (json.status === "photo" && json.photoCount > 0) {
            cancelled = true;
            setPhotoCount(json.photoCount);
            setStage("photo-received");
          }
        }
      } catch { /* ignore */ }
      finally { busy = false; }
    }, POLL_MS);

    return () => { cancelled = true; clearInterval(tick); clearInterval(poll); };
  }, [stage, session, closeSession]);

  function proceedToRead() {
    const id = sessionIdRef.current ?? session?.id;
    if (!id) return;
    void receivePhotos(id, photoCount);
  }

  function typeInstead() {
    closeSession();
    dropPhotos();
    if (formType) {
      setResult({ formId: formTypeId, values: emptyFormValues(formType), confidences: {}, demo: false });
      setEditedValues(emptyFormValues(formType));
    }
    setStage("review");
  }

  function reset() {
    closeSession();
    dropPhotos();
    setResult(null);
    setSession(null);
    setPhotoCount(0);
    setStage("idle");
  }

  function save() {
    onConfirm(editedValues);
    closeSession();
    dropPhotos();
    setStage("saved");
  }

  if (!formType) {
    return (
      <div className="card stack">
        <p className="error-text">Unknown form type: {formTypeId}</p>
        <p className="muted">Available: {Object.keys(FORM_TYPES).join(", ")}</p>
      </div>
    );
  }

  const remaining = session ? session.expiresAt - now : 0;

  return (
    <section className="card scan" aria-labelledby="scan-form-title">
      <h2 id="scan-form-title" className="sr-only">{formType.name}</h2>

      {stage === "idle" && (
        <div className="stack">
          <p className="lead" style={{ fontSize: "1rem" }}>{t.pair.instruction}</p>
          <p className="muted">{t.pair.networkHint}</p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={start}>
              <span aria-hidden="true">⬛</span> {t.pair.start}
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
              <p className="link-text" dir="ltr">{captureUrl}</p>
            </details>
            <p className="muted">{t.pair.networkHint}</p>
            <div className="actions">
              <button type="button" className="btn" onClick={reset}>{t.pair.cancel}</button>
              <button type="button" className="btn" onClick={typeInstead}>{t.pair.manual}</button>
            </div>
          </div>
        </div>
      )}

      {stage === "photo-received" && (
        <div className="stack">
          <p role="status" className="status" style={{ color: "var(--success)" }}>
            ✓ {fmt(t.pair.pagesReceived, { n: photoCount })}
          </p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={proceedToRead}>
              {t.pair.readNow}
            </button>
            <button type="button" className="btn" onClick={reset}>{t.pair.cancel}</button>
          </div>
        </div>
      )}

      {stage === "expired" && (
        <div className="stack" role="alert">
          <p>{t.pair.expired}</p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={start}>{t.pair.newCode}</button>
            <button type="button" className="btn" onClick={typeInstead}>{t.pair.manual}</button>
          </div>
        </div>
      )}

      {stage === "reading" && (
        <div className="stack">
          <p role="status" className="status">
            <span className="spinner" aria-hidden="true" /> {t.review.reading}
          </p>
          <p className="muted">{t.review.readingHint}</p>
        </div>
      )}

      {stage === "error" && (
        <div className="stack" role="alert">
          <p className="error-text">
            {errorKind === "read" ? t.review.error : t.capture.error}
          </p>
          <div className="actions">
            {errorKind === "read" && photoBlobsRef.current.length > 0 ? (
              <button type="button" className="btn btn-primary"
                onClick={() => void runReader(photoBlobsRef.current)}>
                {t.review.retry}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={start}>
                {t.capture.tryAgain}
              </button>
            )}
            <button type="button" className="btn" onClick={typeInstead}>{t.pair.manual}</button>
          </div>
        </div>
      )}

      {stage === "review" && result && (
        <div className="review-form">
          {photoUrl && (
            <figure className="review-photo small">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt={t.review.photoAlt} />
            </figure>
          )}
          <h2>{t.review.title}</h2>
          {result.demo && (
            <p className="notice notice-demo" role="note">{t.review.demoNotice}</p>
          )}
          <p className="muted">{t.review.intro}</p>

          <div className="fields-grid">
            {formType.fields.map((field) => {
              const confidence = result.confidences[field.key] ?? 0;
              const value = editedValues[field.key] ?? "";
              const isEdited = value !== (result.values[field.key] ?? "");
              const level = isEdited ? "edited"
                : !value ? "empty"
                : confidence >= 0.85 ? "high"
                : confidence >= 0.5 ? "medium"
                : "low";
              return (
                <div className="field" key={field.key}>
                  <div className="field-head">
                    <label htmlFor={`form-${field.key}`}>{field.label}</label>
                    <span className={`badge badge-${level}`} aria-label={level}>
                      {level === "high" ? "✓ Sure"
                        : level === "medium" ? "! Check"
                        : level === "edited" ? "✎ Edited"
                        : level === "empty" ? "– Empty"
                        : "? Not sure"}
                    </span>
                  </div>
                  <input
                    id={`form-${field.key}`}
                    type="text"
                    dir="auto"
                    value={value}
                    required={field.required}
                    onChange={(e) => setEditedValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  />
                </div>
              );
            })}
          </div>

          <div className="actions" style={{ marginTop: "1rem" }}>
            <button type="button" className="btn btn-primary" onClick={save}>
              {t.review.save}
            </button>
            <button type="button" className="btn" onClick={reset}>
              {t.review.startOver}
            </button>
          </div>
        </div>
      )}

      {stage === "saved" && (
        <div className="stack" role="status">
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontSize: "1.5rem" }}>✅</span>
            <h3 style={{ margin: 0 }}>{t.review.saved}</h3>
          </div>
          <p className="muted">{t.review.savedBody}</p>
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
