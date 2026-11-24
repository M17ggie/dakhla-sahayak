import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { Application } from "@/db/schema";
import { formatRupees } from "@/i18n/format";
import { resolveLocale } from "@/i18n/request";
import { stepNumber } from "@/lib/workflow";
import { DeadlineChip } from "./deadline-chip";

export async function ApplicationCard({
  application,
  now,
}: {
  application: Application;
  now: Date;
}) {
  const t = await getTranslations();
  const locale = await resolveLocale();
  const name = locale === "en" ? application.applicantNameEn : application.applicantName;
  const village = locale === "en" ? application.villageEn : application.village;

  return (
    <li className="card">
      <Link
        href={`/applications/${application.id}`}
        className="flex flex-wrap items-start gap-x-4 gap-y-2 p-4"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-ink-soft)]">
            {t("application.title", { number: application.applicationNumber })}
          </p>
          <p className="text-lg font-bold">{name}</p>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {village} · {t(`occupation.${application.occupation}`)} ·{" "}
            {formatRupees(application.declaredAnnualIncome)}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <DeadlineChip
            deadlineAt={application.deadlineAt}
            paused={Boolean(application.clockPausedAt)}
            now={now}
          />
          <span className="chip bg-[var(--color-info-soft)] text-[var(--color-ink-soft)]">
            {application.stage === "closed" && application.decision
              ? t(`outcome.${application.decision}`)
              : `${t("step.label", { number: stepNumber(application.stage) })} · ${t(
                  `stage.${application.stage}`,
                )}`}
          </span>
          {application.stage !== "closed" ? (
            <span
              className={`chip ${
                application.findingCount > 0
                  ? "bg-[var(--color-warn-soft)] text-[var(--color-warn)]"
                  : "bg-[var(--color-ok-soft)] text-[var(--color-ok)]"
              }`}
            >
              {t("dashboard.findings", { count: application.findingCount })}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
