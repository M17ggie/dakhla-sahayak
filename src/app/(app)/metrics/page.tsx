import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { getMetrics } from "@/server/repo";

export default async function MetricsPage() {
  const t = await getTranslations();
  const metrics = await getMetrics();

  const tiles: Array<{ key: string; value: string; help?: string }> = [
    { key: "total", value: String(metrics.total) },
    { key: "closed", value: String(metrics.closed) },
    {
      key: "avgDays",
      value:
        metrics.averageDaysToDecision === null
          ? "—"
          : t("metrics.days", { days: metrics.averageDaysToDecision }),
      help: t("metrics.help.avgDays"),
    },
    {
      key: "withinSla",
      value: metrics.withinSlaPercent === null ? "—" : `${metrics.withinSlaPercent}%`,
      help: t("metrics.help.withinSla"),
    },
    {
      key: "returnRate",
      value: `${metrics.returnRatePercent}%`,
      help: t("metrics.help.returnRate"),
    },
    {
      key: "rework",
      value: String(metrics.reworkCount),
      help: t("metrics.help.rework"),
    },
    {
      key: "aiAgreement",
      value:
        metrics.aiAgreementPercent === null ? "—" : `${metrics.aiAgreementPercent}%`,
      help: t("metrics.help.aiAgreement"),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("metrics.title")}</h1>
        <p className="max-w-3xl text-[var(--color-ink-soft)]">{t("metrics.intro")}</p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.key} className="card p-4">
            <dt className="text-sm font-semibold text-[var(--color-ink-soft)]">
              {t(`metrics.${tile.key}`)}
            </dt>
            <dd className="text-3xl font-bold">{tile.value}</dd>
            {tile.help ? (
              <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{tile.help}</p>
            ) : null}
          </div>
        ))}
      </dl>

      {metrics.returnsByStage.length > 0 ? (
        <section className="card p-4" aria-labelledby="returns-heading">
          <h2 id="returns-heading" className="mb-2 text-lg font-semibold">
            {t("metrics.returnsByStage")}
          </h2>
          <ul className="space-y-1">
            {metrics.returnsByStage.map((row) => (
              <li key={row.stage}>
                {t(`stage.${row.stage}`)}: <strong>{row.count}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card p-4" aria-labelledby="overrides-heading">
        <h2 id="overrides-heading" className="mb-2 text-lg font-semibold">
          {t("metrics.overrides")}
        </h2>
        {metrics.overrides.length > 0 ? (
          <ul className="space-y-1">
            {metrics.overrides.map((override, index) => (
              <li key={`${override.applicationId}-${index}`}>
                <Link href={`/applications/${override.applicationId}`}>
                  {t("metrics.overrideRow", {
                    number: override.applicationNumber,
                    suggested: t(`action.${override.suggested}`),
                    action: t(`action.${override.action}`),
                  })}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[var(--color-ink-soft)]">{t("metrics.noOverrides")}</p>
        )}
      </section>
    </div>
  );
}
