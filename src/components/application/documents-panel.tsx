import { getTranslations } from "next-intl/server";

import type { Document } from "@/db/schema";
import { formatDate, formatHectares, formatRupees } from "@/i18n/format";
import { resolveLocale } from "@/i18n/request";
import { ScanPanel } from "./scan-panel";

export async function DocumentsPanel({
  applicationId,
  documents,
  canAct,
}: {
  applicationId: number;
  documents: Document[];
  canAct: boolean;
}) {
  const t = await getTranslations();
  const locale = await resolveLocale();

  return (
    <section className="card p-4" aria-labelledby="documents-heading">
      <h2 id="documents-heading" className="mb-3 text-lg font-semibold">
        {t("documents.heading")}
      </h2>

      {documents.length > 0 ? (
        <ul className="mb-4 space-y-2">
          {documents.map((document) => (
            <li
              key={document.id}
              className="rounded-lg border border-[var(--color-line)] px-3 py-2"
            >
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 font-semibold">
                {t(`docType.${document.docType}`)}
                <span className="text-sm font-normal text-[var(--color-ink-soft)]">
                  {t("documents.addedOn", {
                    source: t(`source.${document.source}`),
                    date: formatDate(document.addedAt, locale),
                  })}
                </span>
              </p>
              <ul className="text-sm text-[var(--color-ink-soft)]">
                {document.nameOnDocument ? (
                  <li>{t("documents.nameOn", { name: document.nameOnDocument })}</li>
                ) : null}
                {document.addressOnDocument ? (
                  <li>{t("documents.addressOn", { address: document.addressOnDocument })}</li>
                ) : null}
                {document.monthlyNetPay ? (
                  <li>{t("documents.netPay", { amount: formatRupees(document.monthlyNetPay) })}</li>
                ) : null}
                {document.annualIncome ? (
                  <li>
                    {t("documents.annualIncome", {
                      amount: formatRupees(document.annualIncome),
                    })}
                  </li>
                ) : null}
                {document.landAreaCentiHectares ? (
                  <li>
                    {t("documents.landArea", {
                      area: formatHectares(document.landAreaCentiHectares / 100),
                      kind: t(document.irrigated ? "documents.irrigated" : "documents.rainfed"),
                    })}
                  </li>
                ) : null}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-[var(--color-ink-soft)]">{t("documents.empty")}</p>
      )}

      {canAct ? (
        <div className="no-print">
          <ScanPanel applicationId={applicationId} />
        </div>
      ) : null}
    </section>
  );
}
