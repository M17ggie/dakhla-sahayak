"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  saveFieldReportAction,
  type ActionState,
} from "@/app/(app)/applications/[id]/actions";
import { formatDateNumeric, formatPercent, formatRupees } from "@/i18n/format";
import { draftPanchnama } from "@/lib/ai/assistant";
import { compareVerifiedIncome } from "@/lib/ai/rules";
import type { Occupation } from "@/db/schema";

export type FieldFormProps = {
  applicationId: number;
  applicantName: string;
  village: string;
  villageEn: string;
  occupation: Occupation;
  declaredAnnualIncome: number;
  declaredFamilyMembers: number;
  talathiName: string;
  existing: {
    residenceConfirmed: boolean | null;
    verifiedFamilyMembers: number | null;
    verifiedAnnualIncome: number | null;
    fieldReport: string | null;
  };
};

/**
 * The short form the Talathi fills in on a phone in the village, and the
 * panchnama it drafts.
 *
 * Income and family size are prefilled from the declaration because most visits
 * confirm what was declared; the Talathi overwrites only what differs.
 */
export function FieldForm(props: FieldFormProps) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveFieldReportAction,
    {},
  );

  const [residenceConfirmed, setResidenceConfirmed] = useState(
    props.existing.residenceConfirmed ?? true,
  );
  const [familyMembers, setFamilyMembers] = useState(
    String(props.existing.verifiedFamilyMembers ?? props.declaredFamilyMembers),
  );
  const [income, setIncome] = useState(
    String(props.existing.verifiedAnnualIncome ?? props.declaredAnnualIncome),
  );
  const [incomeSources, setIncomeSources] = useState("");
  const [assets, setAssets] = useState("");
  const [panchNames, setPanchNames] = useState("");
  const [report, setReport] = useState(props.existing.fieldReport ?? "");

  const comparison = useMemo(() => {
    const parsed = Number(income);
    if (!income.trim() || !Number.isFinite(parsed)) return null;
    return compareVerifiedIncome(props.declaredAnnualIncome, parsed);
  }, [income, props.declaredAnnualIncome]);

  function buildDraft() {
    const parsedIncome = Number(income);
    const parsedFamily = Number(familyMembers);

    const draft = draftPanchnama(
      {
        applicantName: props.applicantName,
        applicantNameEn: props.applicantName,
        village: props.village,
        villageEn: props.villageEn,
        occupation: props.occupation,
        declaredAnnualIncome: props.declaredAnnualIncome,
        declaredFamilyMembers: props.declaredFamilyMembers,
      },
      {
        residenceConfirmed,
        verifiedFamilyMembers: Number.isFinite(parsedFamily) ? parsedFamily : 0,
        verifiedAnnualIncome: Number.isFinite(parsedIncome) ? parsedIncome : 0,
        incomeSources: incomeSources || t("common.notRecorded"),
        assets: assets || t("common.notRecorded"),
        panchNames: panchNames || t("common.notRecorded"),
      },
      { visitDate: formatDateNumeric(new Date()), talathiName: props.talathiName },
    );

    setReport(
      t("ai.panchnama", {
        ...draft.params,
        verifiedIncome: formatRupees(Number(draft.params.verifiedIncome)),
        declaredIncome: formatRupees(Number(draft.params.declaredIncome)),
      }),
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="applicationId" value={props.applicationId} />

      <p className="text-sm text-[var(--color-ink-soft)]">{t("field.intro")}</p>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="residenceConfirmed"
          className="mt-1.5 size-5"
          checked={residenceConfirmed}
          onChange={(event) => setResidenceConfirmed(event.target.checked)}
        />
        <span className="font-semibold">{t("field.residenceConfirmed")}</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="verifiedFamilyMembers">
            {t("field.verifiedFamilyMembers")}
          </label>
          <input
            id="verifiedFamilyMembers"
            name="verifiedFamilyMembers"
            className="input"
            inputMode="numeric"
            value={familyMembers}
            onChange={(event) => setFamilyMembers(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="verifiedAnnualIncome">
            {t("field.verifiedAnnualIncome")}
          </label>
          <input
            id="verifiedAnnualIncome"
            name="verifiedAnnualIncome"
            className="input"
            inputMode="numeric"
            value={income}
            onChange={(event) => setIncome(event.target.value)}
            aria-describedby="income-comparison"
          />
        </div>
      </div>

      <p id="income-comparison" className="text-sm">
        <span className="text-[var(--color-ink-soft)]">{t("field.incomeComparison")}: </span>
        {comparison ? (
          <span
            className={
              comparison.code === "field_income_matches"
                ? "text-[var(--color-ok)]"
                : "text-[var(--color-warn)]"
            }
          >
            {t(`ai.income.${comparison.code}`, {
              gapPercent: formatPercent(comparison.gapPercent),
            })}
          </span>
        ) : (
          <span className="text-[var(--color-ink-soft)]">{t("common.notRecorded")}</span>
        )}
      </p>

      <div>
        <label className="label" htmlFor="incomeSources">
          {t("field.incomeSources")}
        </label>
        <input
          id="incomeSources"
          className="input"
          placeholder={t("field.incomeSourcesPlaceholder")}
          value={incomeSources}
          onChange={(event) => setIncomeSources(event.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="assets">
          {t("field.assets")}
        </label>
        <input
          id="assets"
          className="input"
          placeholder={t("field.assetsPlaceholder")}
          value={assets}
          onChange={(event) => setAssets(event.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="panchNames">
          {t("field.panchNames")}
        </label>
        <input
          id="panchNames"
          className="input"
          placeholder={t("field.panchNamesPlaceholder")}
          value={panchNames}
          onChange={(event) => setPanchNames(event.target.value)}
          aria-describedby="panch-hint"
        />
        <p id="panch-hint" className="mt-1 text-sm text-[var(--color-ink-soft)]">
          {t("field.panchHint")}
        </p>
      </div>

      <div>
        <button type="button" className="btn btn-quiet" onClick={buildDraft}>
          {t("field.draft")}
        </button>
      </div>

      <div>
        <label className="label" htmlFor="fieldReport">
          {t("field.report")}
        </label>
        <textarea
          id="fieldReport"
          name="fieldReport"
          className="textarea min-h-56"
          placeholder={t("field.reportPlaceholder")}
          value={report}
          onChange={(event) => setReport(event.target.value)}
          aria-describedby="report-hint"
        />
        <p id="report-hint" className="mt-1 text-sm text-[var(--color-ink-soft)]">
          {t("field.reportHint")}
        </p>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-[var(--color-danger)]"
        >
          {t(`error.${state.error}`)}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="rounded-lg bg-[var(--color-ok-soft)] px-3 py-2 text-[var(--color-ok)]">
          {t("field.saved")}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? t("field.saving") : t("field.save")}
      </button>
    </form>
  );
}
