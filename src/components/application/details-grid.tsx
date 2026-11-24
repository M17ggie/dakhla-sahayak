import { getTranslations } from "next-intl/server";

import type { Application } from "@/db/schema";
import { formatDate, formatRupees } from "@/i18n/format";
import { resolveLocale } from "@/i18n/request";

export async function DetailsGrid({ application }: { application: Application }) {
  const t = await getTranslations();
  const locale = await resolveLocale();

  const rows: Array<[string, string]> = [
    [
      "applicant",
      locale === "en" ? application.applicantNameEn : application.applicantName,
    ],
    ["aadhaar", `XXXX XXXX ${application.aadhaarLast4}`],
    ["mobile", application.mobile],
    [
      "village",
      `${locale === "en" ? application.villageEn : application.village}, ${t("app.office")}`,
    ],
    ["occupation", t(`occupation.${application.occupation}`)],
    ["purpose", t(`purpose.${application.purpose}`)],
    ["declaredIncome", formatRupees(application.declaredAnnualIncome)],
    ["familyMembers", String(application.declaredFamilyMembers)],
    ["submittedAt", formatDate(application.submittedAt, locale)],
    ["deadline", formatDate(application.deadlineAt, locale)],
  ];

  if (application.verifiedAnnualIncome !== null) {
    rows.push(["verifiedIncome", formatRupees(application.verifiedAnnualIncome)]);
  }
  if (application.verifiedFamilyMembers !== null) {
    rows.push(["verifiedFamilyMembers", String(application.verifiedFamilyMembers)]);
  }

  return (
    <section className="card p-4" aria-labelledby="details-heading">
      <h2 id="details-heading" className="mb-3 text-lg font-semibold">
        {t("application.details")}
      </h2>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt className="text-sm text-[var(--color-ink-soft)]">
              {t(`application.field.${key}`)}
            </dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
