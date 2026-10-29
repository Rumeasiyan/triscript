"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { LanguageCode, messages } from "@/lib/i18n";

const API = "";
const WEB = process.env.NEXT_PUBLIC_WEB_URL;

export type Field = { value: string; confidence: number };
export type Letter = Record<
  "subject" | "myNumber" | "yourNumber" | "date" | "from" | "to" | "signedBy" | "language" | "body",
  Field
>;
export type Phase =
  | "connecting"
  | "waiting"
  | "captured"
  | "processing"
  | "review"
  | "confirmed"
  | "saved"
  | "error"
  | "expired";

type SessionResponse = {
  id: string;
  expiresAt: string;
  pairUrl: string;
};

type SessionEvent = { type: string; data?: unknown };

const fieldNames = [
  "subject",
  "myNumber",
  "yourNumber",
  "date",
  "from",
  "to",
  "signedBy",
  "language",
  "body",
] as const;

function isLetter(value: unknown): value is Letter {
  if (!value || typeof value !== "object") return false;
  return fieldNames.every((name) => {
    const field = (value as Record<string, unknown>)[name];
    return (
      !!field &&
      typeof field === "object" &&
      typeof (field as Record<string, unknown>).value === "string" &&
      typeof (field as Record<string, unknown>).confidence === "number" &&
      Number.isFinite((field as Record<string, number>).confidence)
    );
  });
}

export function useSession(language: LanguageCode) {
  const [qr, setQr] = useState("");
  const [phoneUrl, setPhoneUrl] = useState("");
  const [id, setId] = useState("");
  const [phase, setPhase] = useState<Phase>("connecting");
  const [letter, setLetter] = useState<Letter | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const languageRef = useRef(language);
  languageRef.current = language;

  useEffect(() => {
    const controller = new AbortController();
    let events: EventSource | undefined;
    let disposed = false;

    async function createSession() {
      setPhase("connecting");
      setErrorMessage("");
      setLetter(null);
      setQr("");
      setPhoneUrl("");
      setId("");
      setExpiresAt(null);

      try {
        const response = await fetch(`${API}/api/sessions`, {
          method: "POST",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`SESSION_HTTP_${response.status}`);
        }
        const session = (await response.json()) as SessionResponse;
        const expiry = new Date(session.expiresAt);
        if (!session.id || !session.expiresAt || Number.isNaN(expiry.getTime()) || !session.pairUrl) {
          throw new Error("SESSION_INVALID_RESPONSE");
        }

        const pairUrl = new URL(session.pairUrl);
        const webOrigin = WEB || window.location.origin;
        const captureUrl = new URL(`/m/${encodeURIComponent(session.id)}`, webOrigin);
        captureUrl.search = pairUrl.search;
        const qrData = await QRCode.toDataURL(captureUrl.toString(), {
          width: 320,
          margin: 2,
          errorCorrectionLevel: "M",
        });
        if (disposed) return;

        setId(session.id);
        setExpiresAt(expiry);
        setQr(qrData);
        setPhoneUrl(captureUrl.toString());
        setPhase("waiting");

        events = new EventSource(`${API}/api/sessions/${encodeURIComponent(session.id)}/events`);
        let terminalEvent = false;
        events.onmessage = (message) => {
          let event: SessionEvent;
          try {
            event = JSON.parse(message.data) as SessionEvent;
          } catch {
            setErrorMessage(messages[languageRef.current].ocrFailed);
            setPhase("error");
            events?.close();
            return;
          }

          switch (event.type) {
            case "captured":
              setErrorMessage("");
              setPhase("captured");
              break;
            case "processing":
              setPhase("processing");
              break;
            case "result":
              if (!isLetter(event.data)) {
                terminalEvent = true;
                setErrorMessage("The server returned incomplete letter fields.");
                setPhase("error");
                events?.close();
                return;
              }
              setLetter(event.data);
              terminalEvent = true;
              setPhase("review");
              events?.close();
              break;
            case "page-ready":
              setErrorMessage("");
              setPhase("waiting");
              break;
            case "error":
              setErrorMessage(uploadErrorMessage(event.data, languageRef.current));
              setPhase("waiting");
              break;
            case "expired":
              terminalEvent = true;
              setPhase("expired");
              events?.close();
              break;
            default:
              break;
          }
        };
        events.onerror = () => {
          if (!disposed && !terminalEvent) {
            setErrorMessage(messages[languageRef.current].sessionStreamDisconnected);
            setPhase("error");
          }
          events?.close();
        };
      } catch (error) {
        if (disposed || (error instanceof DOMException && error.name === "AbortError")) return;
        const status = error instanceof Error ? error.message.match(/^SESSION_HTTP_(\d+)$/)?.[1] : undefined;
        const message = messages[languageRef.current].sessionRequestFailed;
        setErrorMessage(status ? `${message} (${status})` : message);
        setPhase("error");
      }
    }

    void createSession();
    return () => {
      disposed = true;
      controller.abort();
      events?.close();
    };
  }, [attempt]);

  const restart = useCallback(() => setAttempt((value) => value + 1), []);

  return { id, qr, phoneUrl, phase, letter, expiresAt, errorMessage, restart, setPhase };
}

function uploadErrorMessage(code: unknown, language: LanguageCode): string {
  const text = messages[language];
  if (code === "too_dark") return text.qualityTooDark;
  if (code === "blurred") return text.qualityBlurred;
  if (code === "cut_off") return text.qualityCutOff;
  if (code === "image_check_failed") return text.qualityFailed;
  if (code === "image_unreadable") return text.ocrImageUnreadable;
  if (code === "no_text") return text.ocrNoText;
  if (code === "page_limit") return text.pageLimitReached;
  return text.ocrFailed;
}

export const apiBase = API;
