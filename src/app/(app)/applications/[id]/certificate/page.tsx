import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PrintButton } from "@/components/print-button";
import { formatDateNumeric, formatRupees } from "@/i18n/format";
import { resolveLocale } from "@/i18n/request";
import { getApplication, parseApplicationId } from "@/server/repo";

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = parseApplicationId(rawId);
  if (id === null) notFound();

  const detail = await getApplication(id);
  if (!detail) notFound();

  const { application, certifiedBy } = detail;
  const t = await getTranslations();
  const locale = await resolveLocale();

  const back = (
    <Link href={`/applications/${application.id}`} className="no-print text-sm font-semibold">
      ← {t("certificate.backToApplication")}
    </Link>
  );

  if (
    application.decision !== "approved" ||
    !application.certificateNumber ||
    !application.decidedAt
  ) {
    return (
      <div className="space-y-4">
        {back}
        <p className="card p-6 text-center text-[var(--color-ink-soft)]">
          {t("certificate.notApproved")}
        </p>
      </div>
    );
  }

  const certifiedIncome =
    application.certifiedAnnualIncome ?? application.declaredAnnualIncome;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        {back}
        <PrintButton />
      </div>

      <article className="card print-sheet mx-auto max-w-2xl p-6 sm:p-10">
        <header className="mb-6 border-b-2 border-[var(--color-ink)] pb-4 text-center">
          <p className="font-semibold">{t("certificate.government")}</p>
          <p>{t("app.office")}</p>
          <h1 className="mt-3 text-xl font-bold tracking-wide">{t("certificate.title")}</h1>
        </header>

        <dl className="mb-6 flex flex-wrap justify-between gap-4 text-sm">
          <div>
            <dt className="text-[var(--color-ink-soft)]">{t("certificate.number")}</dt>
            <dd className="font-mono font-semibold">{application.certificateNumber}</dd>
          </div>
          <div className="text-right">
            <dt className="text-[var(--color-ink-soft)]">{t("certificate.date")}</dt>
            <dd className="font-semibold">{formatDateNumeric(application.decidedAt)}</dd>
          </div>
        </dl>

        <p className="whitespace-pre-wrap">
          {t("certificate.body", {
            applicantName:
              locale === "en" ? application.applicantNameEn : application.applicantName,
            village: locale === "en" ? application.villageEn : application.village,
            taluka: application.taluka,
            district: application.district,
            familyMembers:
              application.verifiedFamilyMembers ?? application.declaredFamilyMembers,
            certifiedIncome: formatRupees(certifiedIncome),
            purpose: t(`purpose.${application.purpose}`),
          })}
        </p>

        <p className="mt-6 text-sm text-[var(--color-ink-soft)]">
          {t("certificate.validity")}
        </p>

        <footer className="mt-12 text-right">
          <p className="font-semibold">{certifiedBy?.fullName ?? ""}</p>
          <p className="text-sm">{t("certificate.signature")}</p>
          <p className="text-sm text-[var(--color-ink-soft)]">{t("app.office")}</p>
        </footer>
      </article>
    </div>
  );
}
