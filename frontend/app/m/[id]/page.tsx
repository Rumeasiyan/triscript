"use client";

import { useEffect, useState } from "react";
import { apiBase } from "@/lib/useSession";
import { LanguageCode, messages } from "@/lib/i18n";

type Props = { params: { id: string } };
type SendState = "ready" | "sending" | "page-ready" | "sent" | "expired" | "error";
const maxUploadBytes = 12 * 1024 * 1024;

async function preparePhoto(file: File): Promise<Blob> {
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2200 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("prepare-photo");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    if (!blob) throw new Error("prepare-photo");
    return blob;
  } finally {
    image.close();
  }
}

export default function PhoneCapturePage({ params }: Props) {
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [token, setToken] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [state, setState] = useState<SendState>("ready");
  const [errorMessage, setErrorMessage] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const text = messages[language];

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setToken(query.get("t") ?? "");
    const requestedLanguage = query.get("ui");
    if (requestedLanguage === "si" || requestedLanguage === "ta") {
      setLanguage(requestedLanguage);
    }
  }, []);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function selectPhoto(file?: File) {
    if (!file) return;
    setErrorMessage("");
    setState("ready");
    setPreparing(true);
    try {
      if (!file.type.startsWith("image/")) throw new Error(text.photoFailed);
      const prepared = await preparePhoto(file);
      if (prepared.size > maxUploadBytes) throw new Error(text.photoTooLarge);
      const nextPreview = URL.createObjectURL(prepared);
      setPreviewUrl(nextPreview);
      setPhoto(prepared);
    } catch (error) {
      setPhoto(null);
      setPreviewUrl("");
      setErrorMessage(error instanceof Error && error.message !== "prepare-photo" ? error.message : text.photoPrepareFailed);
    } finally {
      setPreparing(false);
    }
  }

  function uploadErrorMessage(code: string): string {
    if (code === "too_dark") return text.qualityTooDark;
    if (code === "blurred") return text.qualityBlurred;
    if (code === "cut_off") return text.qualityCutOff;
    if (code === "image_check_failed") return text.qualityFailed;
    if (code === "image_unreadable") return text.ocrImageUnreadable;
    if (code === "no_text") return text.ocrNoText;
    if (code === "page_limit") return text.pageLimitReached;
    return text.photoFailed;
  }

  async function sendPhoto(complete: boolean) {
    if (!photo || !token) {
      setErrorMessage(text.phoneExpired);
      return;
    }
    setState("sending");
    setErrorMessage("");
    const form = new FormData();
    form.append("photo", photo, "letter.jpg");
    form.append("complete", String(complete));

    try {
      const response = await fetch(
        `${apiBase}/api/sessions/${encodeURIComponent(params.id)}/photo?t=${encodeURIComponent(token)}`,
        { method: "POST", body: form },
      );
      if (response.status === 410) {
        setState("expired");
        return;
      }
      if (response.status === 413) throw new Error(text.photoTooLarge);
      if (response.status === 401) {
        setState("expired");
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ? uploadErrorMessage(body.error) : text.photoFailed);
      }

      const result = await response.json() as { page?: number; complete?: boolean };
      setPageCount(typeof result.page === "number" ? result.page : pageCount + 1);
      setState(result.complete ? "sent" : "page-ready");
      setPhoto(null);
      setPreviewUrl("");
    } catch (error) {
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : text.photoFailed);
    }
  }

  const expired = state === "expired" || !token;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <header className="flex items-center justify-between bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded bg-blue-600 font-extrabold">T</span>
            <span className="font-bold">TRISCRIPT</span>
          </div>
          <label className="sr-only" htmlFor="phone-language">{text.languageLabel}</label>
          <select
            id="phone-language"
            className="rounded border border-slate-500 bg-slate-800 px-2 py-1 text-sm text-white"
            value={language}
            onChange={(event) => setLanguage(event.target.value as LanguageCode)}
          >
            <option value="en">English</option>
            <option value="si">සිංහල</option>
            <option value="ta">தமிழ்</option>
          </select>
        </header>

        <section className="space-y-5 p-5 sm:p-7" aria-labelledby="phone-title">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-950">
              {text.officialNotice}: {text.testNotice.split(" • ")[0]}
            </p>
            <h1 id="phone-title" className="text-2xl font-extrabold">{text.phoneTitle}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-700">{text.phoneSubtitle}</p>
          </div>

          {previewUrl ? (
            <div className="overflow-hidden rounded-xl border-2 border-slate-300 bg-slate-950 p-2">
              <img src={previewUrl} alt={text.photoPreviewAlt} className="mx-auto max-h-[55vh] w-auto max-w-full object-contain" />
            </div>
          ) : (
            <div className="grid min-h-64 place-items-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-950 p-5 text-center text-sm text-white">
              <p>{text.phoneCameraHint}</p>
            </div>
          )}

          <p className="text-sm leading-6 text-slate-700">{text.phonePrivacy}</p>

          {expired ? (
            <div role="alert" className="rounded-lg border-l-4 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-950">
              {text.phoneExpired}
            </div>
          ) : state === "sent" ? (
            <div role="status" className="rounded-lg border-l-4 border-emerald-700 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950">
              {text.photoSent}
            </div>
          ) : (
            <div className="space-y-3">
              {state === "page-ready" && (
                <p role="status" className="rounded-lg border-l-4 border-emerald-700 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950">
                  {text.pageProcessed.replace("{count}", String(pageCount))}
                </p>
              )}
              <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-lg border-2 border-blue-800 bg-white px-4 py-3 text-center font-bold text-blue-900 hover:bg-blue-50">
                {state === "sending" ? text.sendingPage : preparing ? text.preparingPhoto : previewUrl ? text.retakePhoto : text.choosePhoto}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  disabled={state === "sending" || preparing}
                  onChange={(event) => {
                    void selectPhoto(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {previewUrl && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void sendPhoto(false)}
                    disabled={state === "sending" || preparing}
                    className="min-h-14 rounded-lg border-2 border-blue-800 bg-white px-5 py-3 font-extrabold text-blue-900 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-70"
                  >
                    {text.addPage}
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendPhoto(true)}
                    disabled={state === "sending" || preparing}
                    className="min-h-14 rounded-lg bg-blue-700 px-5 py-3 font-extrabold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70"
                  >
                    {text.finishLetter}
                  </button>
                </div>
              )}
            </div>
          )}

          {(errorMessage || state === "error") && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-900">
              {errorMessage || text.photoFailed}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
