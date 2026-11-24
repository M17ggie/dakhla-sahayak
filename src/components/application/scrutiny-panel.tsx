import { getTranslations } from "next-intl/server";

import { runAi } from "@/app/(app)/applications/[id]/actions";
import type { Application, Event } from "@/db/schema";
import { formatDateTime } from "@/i18n/format";
import { resolveLocale } from "@/i18n/request";
import type { ScrutinyAssessment } from "@/lib/ai/assistant";
import { FindingList, SuggestionBox } from "./finding-list";
import { smsDraft } from "./drafts";

export async function ScrutinyPanel({
  application,
  assessment,
  lastRun,
  canAct,
}: {
  application: Application;
  assessment: ScrutinyAssessment;
  lastRun: Event | null;
  canAct: boolean;
}) {
  const t = await getTranslations();
  const locale = await resolveLocale();
  const sms = smsDraft(application.applicationNumber, assessment.findings, t);

  return (
    <section className="card p-4" aria-labelledby="ai-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="ai-heading" className="text-lg font-semibold">
          {t("ai.heading")}
        </h2>
        {canAct ? (
          <form action={runAi} className="no-print">
            <input type="hidden" name="applicationId" value={application.id} />
            <button type="submit" className="btn btn-quiet">
              {lastRun ? t("ai.runAgain") : t("ai.run")}
            </button>
          </form>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-sm text-[var(--color-ink-soft)]">
          {t("ai.risk")}:{" "}
          <span
            className={`text-xl font-bold ${
              assessment.riskScore >= 50
                ? "text-[var(--color-danger)]"
                : assessment.riskScore > 0
                  ? "text-[var(--color-warn)]"
                  : "text-[var(--color-ok)]"
            }`}
          >
            {assessment.riskScore}
          </span>
        </p>
        {lastRun ? (
          <p className="text-sm text-[var(--color-ink-soft)]">
            {t("ai.lastRun", { date: formatDateTime(lastRun.createdAt, locale) })}
          </p>
        ) : null}
      </div>
      <p className="mb-4 text-sm text-[var(--color-ink-soft)]">{t("ai.riskNote")}</p>

      <h3 className="mb-2 font-semibold">{t("ai.checklist")}</h3>
      <ul className="mb-4 divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)]">
        {assessment.checklist.map((row) => (
          <li key={row.code} className="flex flex-wrap items-center gap-x-3 px-3 py-2">
            <span
              aria-hidden
              className={`font-bold ${
                row.present ? "text-[var(--color-ok)]" : "text-[var(--color-danger)]"
              }`}
            >
              {row.present ? "✓" : "✗"}
            </span>
            <span className="mr-auto font-semibold">{t(`requirement.${row.code}`)}</span>
            <span
              className={`chip ${
                row.present
                  ? "bg-[var(--color-ok-soft)] text-[var(--color-ok)]"
                  : "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
              }`}
            >
              {row.present ? t("ai.present") : t("ai.missing")}
            </span>
            {row.satisfiedBy ? (
              <span className="text-sm text-[var(--color-ink-soft)]">
                {t("ai.satisfiedBy", { docType: t(`docType.${row.satisfiedBy}`) })}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <h3 className="mb-2 font-semibold">{t("ai.findings")}</h3>
      {assessment.findings.length > 0 ? (
        <FindingList findings={assessment.findings} />
      ) : (
        <p className="rounded-lg bg-[var(--color-ok-soft)] px-3 py-2 text-[var(--color-ok)]">
          {t("ai.noFindings")}
        </p>
      )}

      <div className="mt-4">
        <SuggestionBox suggestion={assessment.suggestion} />
      </div>

      {sms ? (
        <div className="mt-4">
          <h3 className="mb-2 font-semibold">{t("ai.sms.heading")}</h3>
          <pre className="rounded-lg border border-[var(--color-line)] bg-[var(--color-info-soft)] p-3 font-sans text-sm whitespace-pre-wrap">
            {sms}
          </pre>
          {canAct ? (
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{t("ai.sms.note")}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
