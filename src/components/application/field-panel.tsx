import { getTranslations } from "next-intl/server";

import type { Application } from "@/db/schema";
import { displayParams } from "@/lib/ai/display";
import type { FieldAssessment } from "@/lib/ai/assistant";
import { resolveLocale } from "@/i18n/request";
import { SuggestionBox } from "./finding-list";
import { FieldForm } from "./field-form";

export async function FieldPanel({
  application,
  assessment,
  canAct,
  talathiName,
}: {
  application: Application;
  assessment: FieldAssessment;
  canAct: boolean;
  talathiName: string;
}) {
  const t = await getTranslations();
  const locale = await resolveLocale();

  return (
    <>
      <section className="card p-4" aria-labelledby="visit-heading">
        <h2 id="visit-heading" className="mb-3 text-lg font-semibold">
          {t("ai.visit.heading")}
        </h2>
        <ol className="space-y-2">
          {assessment.checklist.map((item, index) => (
            <li
              key={`${item.code}-${index}`}
              className={`flex gap-3 rounded-lg px-3 py-2 ${
                item.fromFinding
                  ? "bg-[var(--color-warn-soft)]"
                  : "bg-[var(--color-info-soft)]"
              }`}
            >
              <span aria-hidden className="font-bold text-[var(--color-ink-soft)]">
                {index + 1}.
              </span>
              <span>
                {t(`ai.visitItem.${item.code}`, displayParams(item.params, t))}
                {item.fromFinding ? (
                  <span className="ml-2 text-xs font-semibold text-[var(--color-warn)] uppercase">
                    {t("ai.visit.fromFinding")}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-4">
          <SuggestionBox suggestion={assessment.suggestion} />
        </div>
      </section>

      <section className="card p-4" aria-labelledby="field-heading">
        <h2 id="field-heading" className="mb-3 text-lg font-semibold">
          {t("field.heading")}
        </h2>
        {canAct ? (
          <FieldForm
            applicationId={application.id}
            applicantName={
              locale === "en" ? application.applicantNameEn : application.applicantName
            }
            village={locale === "en" ? application.villageEn : application.village}
            villageEn={application.villageEn}
            occupation={application.occupation}
            declaredAnnualIncome={application.declaredAnnualIncome}
            declaredFamilyMembers={application.declaredFamilyMembers}
            talathiName={talathiName}
            existing={{
              residenceConfirmed: application.residenceConfirmed,
              verifiedFamilyMembers: application.verifiedFamilyMembers,
              verifiedAnnualIncome: application.verifiedAnnualIncome,
              fieldReport: application.fieldReport,
            }}
          />
        ) : application.fieldReport ? (
          <p className="whitespace-pre-wrap">{application.fieldReport}</p>
        ) : (
          <p className="text-[var(--color-ink-soft)]">{t("field.noReport")}</p>
        )}
      </section>
    </>
  );
}
