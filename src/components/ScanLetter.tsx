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
 * enters a letter. It pairs a phone by QR code, receives the photo(s), reads
 * them, lets the person check and correct every field, and calls onConfirm with
 * the confirmed values. It never calls onConfirm without the person pressing Save.
 *
 * Multi-page: after the first photo arrives the person can add more pages before
 * proceeding to reading. Up to 5 pages per letter.
 */

type Stage =
  | "idle"
  | "starting"
  | "pairing"
  | "photo-received"   // at least one photo, phone still active
  | "reading"
  | "review"
  | "saved"
  | "expired"
  | "error";

type ErrorKind = "pair" | "read";

const POLL_MS = 1500;
const MAX_PAGES = 5;

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
  const [photoCount, setPhotoCount] = useState(0);
  const [result, setResult] = useState<ReadResult | null>(null);

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

  // Delete the session and photos if the person leaves.
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
      setStage("reading");
      try {
        // For multi-page letters, combine all pages into one blob by stitching them
        // vertically on a canvas — the reader sees a single tall image.
        const blob = blobs.length === 1 ? blobs[0] : await stitchPages(blobs);
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

  /** Fetch all photos from the server and show the first as preview. */
  const receivePhotos = useCallback(
    async (id: string, count: number) => {
      setStage("reading");
      try {
        const blobs: Blob[] = [];
        for (let page = 1; page <= count; page++) {
          const res = await fetch(`/api/session/${id}/photo?page=${page}`, {
            cache: "no-store",
          });
          if (!res.ok) break;
          blobs.push(await res.blob());
        }
        if (blobs.length === 0) throw new Error("no photos");

        photoBlobsRef.current = blobs;
        const url = URL.createObjectURL(blobs[0]);
        photoUrlRef.current = url;
        setPhotoUrl(url);
        setPhotoCount(blobs.length);

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

  // While pairing: tick the countdown and poll for photos.
  useEffect(() => {
    if (stage !== "pairing" || !session) return;
    let cancelled = false;
    let busy = false;
    let lastCount = 0;

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
          const json = (await res.json()) as {
            status: "waiting" | "photo";
            photoCount: number;
          };
          if (json.status === "photo" && json.photoCount > lastCount) {
            lastCount = json.photoCount;
            setPhotoCount(json.photoCount);
            // Transition to "photo-received" so the person can add more pages
            setStage("photo-received");
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
  }, [stage, session, closeSession]);

  // While in photo-received: keep polling so the count updates when more arrive.
  useEffect(() => {
    if (stage !== "photo-received" || !session) return;
    let cancelled = false;
    let busy = false;

    const poll = setInterval(async () => {
      if (busy || cancelled) return;
      busy = true;
      try {
        const res = await fetch(`/api/session/${session.id}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.ok) {
          const json = (await res.json()) as {
            status: "waiting" | "photo";
            photoCount: number;
          };
          setPhotoCount(json.photoCount);
        }
      } catch {
        /* ignore */
      } finally {
        busy = false;
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [stage, session]);

  function proceedToRead() {
    const id = sessionIdRef.current ?? session?.id;
    if (!id) return;
    void receivePhotos(id, photoCount);
  }

  function typeInstead() {
    closeSession();
    dropPhotos();
    setResult({ fields: emptyFields(), demo: false });
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

  function save(values: FieldValues) {
    onConfirm(values);
    closeSession(); // the photos are deleted on the server here
    dropPhotos();
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

      {stage === "photo-received" && (
        <div className="stack">
          <p role="status" className="status" style={{ color: "var(--success)" }}>
            ✓ {fmt(t.pair.pagesReceived, { n: photoCount })}
          </p>
          <p className="muted">{t.pair.addPageHint}</p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={proceedToRead}>
              {t.pair.readNow}
            </button>
            {photoCount < MAX_PAGES && (
              <p className="muted" style={{ fontSize: "0.875rem" }}>
                {t.pair.addPagePhone}
              </p>
            )}
            <button type="button" className="btn" onClick={reset}>
              {t.pair.cancel}
            </button>
          </div>
          {session && (
            <p className="countdown" aria-live="off">
              {fmt(t.pair.expiresIn, { time: formatTime(remaining) })}
            </p>
          )}
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
            {errorKind === "read" && photoBlobsRef.current.length > 0 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const blobs = photoBlobsRef.current;
                  if (blobs.length > 0) void runReader(blobs);
                }}
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

// ─── Multi-page stitch ───────────────────────────────────────────────────────

/**
 * Stitch multiple page images into a single tall JPEG for the OCR reader.
 * Pages are placed top to bottom, separated by a thin white gap.
 */
async function stitchPages(blobs: Blob[]): Promise<Blob> {
  const GAP = 20;
  try {
    const bitmaps = await Promise.all(
      blobs.map((b) => createImageBitmap(b, { imageOrientation: "from-image" })),
    );
    const width = Math.max(...bitmaps.map((b) => b.width));
    const totalHeight =
      bitmaps.reduce((s, b) => s + b.height, 0) + GAP * (bitmaps.length - 1);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = totalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmaps.forEach((b) => b.close());
      return blobs[0];
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, totalHeight);

    let y = 0;
    for (const bitmap of bitmaps) {
      ctx.drawImage(bitmap, 0, y, bitmap.width, bitmap.height);
      y += bitmap.height + GAP;
      bitmap.close();
    }

    const result = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", 0.88),
    );
    return result ?? blobs[0];
  } catch {
    return blobs[0];
  }
}
