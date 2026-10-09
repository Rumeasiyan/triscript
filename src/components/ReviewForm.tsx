"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { fmt } from "@/lib/i18n";
import {
  FIELD_KEYS,
  confidenceLevel,
  type ConfidenceLevel,
  type FieldKey,
  type FieldValues,
  type ReadResult,
} from "@/lib/types";
import { useI18n } from "./I18nProvider";

interface Props {
  result: ReadResult;
  photoUrl: string | null;
  onSave: (values: FieldValues) => void;
  onStartOver: () => void;
}

const ICONS: Record<ConfidenceLevel | "edited", string> = {
  high: "✓",
  medium: "!",
  low: "?",
  empty: "–",
  edited: "✎",
};

function ConfidenceBadge({
  level,
  percent,
}: {
  level: ConfidenceLevel | "edited";
  percent?: number;
}) {
  const { t } = useI18n();
  const label = t.review.confidence[level];
  const spoken =
    percent !== undefined && level !== "edited" && level !== "empty"
      ? `${label}, ${fmt(t.review.percent, { n: percent })}`
      : label;
  return (
    <span className={`badge badge-${level}`} role="img" aria-label={`${t.review.confidenceLabel}: ${spoken}`}>
      <span aria-hidden="true">
        {ICONS[level]} {label}
        {percent !== undefined && level !== "edited" && level !== "empty" ? ` · ${percent}%` : ""}
      </span>
    </span>
  );
}

export function ReviewForm({ result, photoUrl, onSave, onStartOver }: Props) {
  const { t } = useI18n();
  const baseId = useId();
  const [values, setValues] = useState<FieldValues>(() => {
    return Object.fromEntries(FIELD_KEYS.map((k) => [k, result.fields[k].value])) as FieldValues;
  });
  const [confirmed, setConfirmed] = useState(false);
  const [showConfirmError, setShowConfirmError] = useState(false);

  const original = result.fields;
  const edited = useMemo(
    () => new Set(FIELD_KEYS.filter((k) => values[k] !== original[k].value)),
    [values, original],
  );

  function change(key: FieldKey, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!confirmed) {
      setShowConfirmError(true);
      return;
    }
    onSave(values);
  }

  return (
    <div className="review">
      {photoUrl && (
        <figure className="review-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt={t.review.photoAlt} />
        </figure>
      )}

      <form className="review-form" onSubmit={submit} noValidate>
        <h2>{t.review.title}</h2>
        {result.demo && (
          <p className="notice notice-demo" role="note">
            {t.review.demoNotice}
          </p>
        )}
        <p>{t.review.intro}</p>

        {FIELD_KEYS.map((key) => {
          const id = `${baseId}-${key}`;
          const level: ConfidenceLevel | "edited" = edited.has(key)
            ? "edited"
            : confidenceLevel(original[key]);
          const percent = Math.round(original[key].confidence * 100);
          return (
            <div className="field" key={key}>
              <div className="field-head">
                <label htmlFor={id}>{t.fields[key]}</label>
                <ConfidenceBadge level={level} percent={percent} />
              </div>

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
                  <option value="si">{t.review.languageOptions.si}</option>
                  <option value="ta">{t.review.languageOptions.ta}</option>
                  <option value="en">{t.review.languageOptions.en}</option>
                  <option value="mixed">{t.review.languageOptions.mixed}</option>
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

        <div className="confirm">
          <label className="check">
            <input
              type="checkbox"
              checked={confirmed}
              aria-describedby={showConfirmError && !confirmed ? `${baseId}-err` : undefined}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                if (e.target.checked) setShowConfirmError(false);
              }}
            />
            <span>{t.review.confirmLabel}</span>
          </label>
          {showConfirmError && !confirmed && (
            <p id={`${baseId}-err`} role="alert" className="error-text">
              {t.review.mustConfirm}
            </p>
          )}
        </div>

        <div className="actions">
          <button type="submit" className="btn btn-primary">
            {t.review.save}
          </button>
          <button type="button" className="btn" onClick={onStartOver}>
            {t.review.startOver}
          </button>
        </div>
      </form>
    </div>
  );
}
