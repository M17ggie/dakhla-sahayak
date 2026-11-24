"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  saveScannedDocument,
  type ActionState,
} from "@/app/(app)/applications/[id]/actions";
import { DOC_TYPES, type DocType } from "@/db/schema";
import { extractFields, type ExtractedFields } from "@/lib/ai/extract";
import samples from "@/db/fixtures/sample-documents.json";

type Fields = {
  docType: DocType;
  nameOnDocument: string;
  addressOnDocument: string;
  monthlyNetPay: string;
  annualIncome: string;
  landAreaHectares: string;
  irrigated: boolean;
  rawText: string;
};

function toFields(extracted: ExtractedFields, rawText: string): Fields {
  return {
    docType: extracted.docType ?? "other",
    nameOnDocument: extracted.nameOnDocument ?? "",
    addressOnDocument: extracted.addressOnDocument ?? "",
    monthlyNetPay: extracted.monthlyNetPay ? String(extracted.monthlyNetPay) : "",
    annualIncome: extracted.annualIncome ? String(extracted.annualIncome) : "",
    landAreaHectares: extracted.landAreaCentiHectares
      ? String(extracted.landAreaCentiHectares / 100)
      : "",
    irrigated: extracted.irrigated === true,
    rawText,
  };
}

/**
 * Reads a photographed document in the browser.
 *
 * The recognition runs on the clerk's own machine through Tesseract, so Aadhaar
 * numbers and income papers never leave the office. What comes out is never
 * trusted: it lands in an editable form that the clerk confirms before anything
 * is written to the file.
 */
export function ScanPanel({ applicationId }: { applicationId: number }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveScannedDocument,
    {},
  );

  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [ocrError, setOcrError] = useState(false);
  const [fields, setFields] = useState<Fields | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function readImage(file: File) {
    setOcrError(false);
    setProgress(0);
    try {
      // Loaded on demand: the recognition bundle and the Marathi language data
      // are large, and most visits to this screen never scan anything.
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(["mar", "eng"], 1, {
        logger: (message: { status: string; progress: number }) => {
          if (message.status === "recognizing text") {
            setProgress(Math.round(message.progress * 100));
          }
        },
      });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      setFields(toFields(extractFields(data.text), data.text));
    } catch {
      setOcrError(true);
    } finally {
      setProgress(null);
    }
  }

  function applySample(text: string) {
    setOcrError(false);
    setFields(toFields(extractFields(text), text));
  }

  // A saved document is already shown by the list behind this panel, so the
  // form clears itself and goes back to waiting for the next one. Adjusting the
  // state during render rather than in an effect keeps it to a single pass.
  const [handled, setHandled] = useState<ActionState | null>(null);
  if (state.ok && state !== handled) {
    setHandled(state);
    setFields(null);
  }

  function reset() {
    setFields(null);
    setOcrError(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-quiet" onClick={() => setOpen(true)}>
        {t("documents.add")}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-line)] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="font-semibold">{t("documents.scan.heading")}</h3>
        <button
          type="button"
          className="btn btn-quiet px-3 py-1.5 text-sm"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          {t("common.close")}
        </button>
      </div>

      <p className="mb-3 text-sm text-[var(--color-ink-soft)]">{t("documents.scan.privacy")}</p>

      {state.ok && !fields ? (
        <p
          role="status"
          className="mb-3 rounded-lg bg-[var(--color-ok-soft)] px-3 py-2 text-[var(--color-ok)]"
        >
          {t("documents.scan.saved")}
        </p>
      ) : null}

      {!fields ? (
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="scan-file">
              {t("documents.scan.capture")}
            </label>
            <input
              id="scan-file"
              ref={fileInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readImage(file);
              }}
            />
          </div>

          {progress !== null ? (
            <p role="status" className="text-sm">
              {t("documents.scan.reading", { percent: progress })}
            </p>
          ) : null}

          {ocrError ? (
            <p
              role="alert"
              className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-[var(--color-danger)]"
            >
              {t("error.OCR_FAILED")}
            </p>
          ) : null}

          <div>
            <p className="label">{t("documents.scan.sampleHeading")}</p>
            <div className="flex flex-wrap gap-2">
              {samples.map((sample) => (
                <button
                  key={sample.key}
                  type="button"
                  className="btn btn-quiet px-3 py-1.5 text-sm"
                  onClick={() => applySample(sample.text)}
                >
                  {t("documents.scan.sample", {
                    docType: t(`docType.${sample.labelCode}`),
                  })}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="applicationId" value={applicationId} />
          <input type="hidden" name="rawText" value={fields.rawText} />

          <p className="rounded-lg bg-[var(--color-warn-soft)] px-3 py-2 text-sm text-[var(--color-warn)]">
            {t("documents.scan.readNote")}
          </p>

          <div>
            <label className="label" htmlFor="docType">
              {t("documents.scan.docType")}
            </label>
            <select
              id="docType"
              name="docType"
              className="select"
              value={fields.docType}
              onChange={(event) =>
                setFields({ ...fields, docType: event.target.value as DocType })
              }
            >
              {DOC_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`docType.${type}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="nameOnDocument">
              {t("documents.scan.name")}
            </label>
            <input
              id="nameOnDocument"
              name="nameOnDocument"
              className="input"
              value={fields.nameOnDocument}
              onChange={(event) =>
                setFields({ ...fields, nameOnDocument: event.target.value })
              }
            />
          </div>

          <div>
            <label className="label" htmlFor="addressOnDocument">
              {t("documents.scan.address")}
            </label>
            <input
              id="addressOnDocument"
              name="addressOnDocument"
              className="input"
              value={fields.addressOnDocument}
              onChange={(event) =>
                setFields({ ...fields, addressOnDocument: event.target.value })
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="monthlyNetPay">
                {t("documents.scan.monthlyNetPay")}
              </label>
              <input
                id="monthlyNetPay"
                name="monthlyNetPay"
                className="input"
                inputMode="numeric"
                value={fields.monthlyNetPay}
                onChange={(event) =>
                  setFields({ ...fields, monthlyNetPay: event.target.value })
                }
              />
            </div>
            <div>
              <label className="label" htmlFor="annualIncome">
                {t("documents.scan.annualIncome")}
              </label>
              <input
                id="annualIncome"
                name="annualIncome"
                className="input"
                inputMode="numeric"
                value={fields.annualIncome}
                onChange={(event) =>
                  setFields({ ...fields, annualIncome: event.target.value })
                }
              />
            </div>
          </div>

          {fields.docType === "land_7_12" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="landAreaHectares">
                  {t("documents.scan.landArea")}
                </label>
                <input
                  id="landAreaHectares"
                  name="landAreaHectares"
                  className="input"
                  inputMode="decimal"
                  value={fields.landAreaHectares}
                  onChange={(event) =>
                    setFields({ ...fields, landAreaHectares: event.target.value })
                  }
                />
              </div>
              <label className="flex items-end gap-3 pb-2.5">
                <input
                  type="checkbox"
                  name="irrigated"
                  className="size-5"
                  checked={fields.irrigated}
                  onChange={(event) =>
                    setFields({ ...fields, irrigated: event.target.checked })
                  }
                />
                <span className="font-semibold">{t("documents.scan.irrigated")}</span>
              </label>
            </div>
          ) : null}

          <details>
            <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink-soft)]">
              {t("documents.scan.rawText")}
            </summary>
            <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-[var(--color-info-soft)] p-3 font-sans text-sm whitespace-pre-wrap">
              {fields.rawText}
            </pre>
          </details>

          {state.error ? (
            <p
              role="alert"
              className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-[var(--color-danger)]"
            >
              {t(`error.${state.error}`)}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? t("documents.scan.saving") : t("documents.scan.save")}
            </button>
            <button type="button" className="btn btn-quiet" onClick={reset}>
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
