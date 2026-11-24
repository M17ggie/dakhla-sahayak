import { getTranslations } from "next-intl/server";

import type { Application } from "@/db/schema";
import type { DecisionBrief } from "@/lib/ai/assistant";
import { PointList, SuggestionBox } from "./finding-list";
import { orderDraft } from "./drafts";

export async function DecisionPanel({
  application,
  brief,
  canAct,
}: {
  application: Application;
  brief: DecisionBrief;
  canAct: boolean;
}) {
  const t = await getTranslations();
  const order = orderDraft(brief, t);

  return (
    <>
      <section className="card p-4" aria-labelledby="report-heading">
        <h2 id="report-heading" className="mb-3 text-lg font-semibold">
          {t("field.reportFromTalathi")}
        </h2>
        {application.fieldReport ? (
          <p className="whitespace-pre-wrap">{application.fieldReport}</p>
        ) : (
          <p className="text-[var(--color-ink-soft)]">{t("field.noReport")}</p>
        )}
      </section>

      <section className="card p-4" aria-labelledby="brief-heading">
        <h2 id="brief-heading" className="mb-3 text-lg font-semibold">
          {t("ai.brief.heading")}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 font-semibold text-[var(--color-ok)]">{t("ai.brief.for")}</h3>
            {brief.pointsFor.length > 0 ? (
              <PointList points={brief.pointsFor} tone="for" />
            ) : (
              <p className="text-sm text-[var(--color-ink-soft)]">{t("ai.brief.noneFor")}</p>
            )}
          </div>
          <div>
            <h3 className="mb-2 font-semibold text-[var(--color-warn)]">
              {t("ai.brief.against")}
            </h3>
            {brief.pointsAgainst.length > 0 ? (
              <PointList points={brief.pointsAgainst} tone="against" />
            ) : (
              <p className="text-sm text-[var(--color-ink-soft)]">{t("ai.brief.noneAgainst")}</p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <SuggestionBox suggestion={brief.suggestion} />
        </div>

        <div className="mt-4">
          <h3 className="mb-2 font-semibold">{t("ai.brief.orderDraft")}</h3>
          <pre className="rounded-lg border border-[var(--color-line)] bg-[var(--color-info-soft)] p-3 font-sans text-sm whitespace-pre-wrap">
            {order}
          </pre>
          {canAct ? (
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{t("ai.sms.note")}</p>
          ) : null}
        </div>
      </section>
    </>
  );
}
