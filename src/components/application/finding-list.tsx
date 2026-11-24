import { getTranslations } from "next-intl/server";

import { displayParams } from "@/lib/ai/display";
import type { Finding, Severity } from "@/lib/ai/rules";
import type { Point, Suggestion } from "@/lib/ai/assistant";

const SEVERITY_STYLE: Record<Severity, string> = {
  high: "border-l-4 border-[var(--color-danger)] bg-[var(--color-danger-soft)]",
  medium: "border-l-4 border-[var(--color-warn)] bg-[var(--color-warn-soft)]",
  low: "border-l-4 border-[var(--color-line)] bg-[var(--color-info-soft)]",
  info: "border-l-4 border-[var(--color-line)] bg-[var(--color-info-soft)]",
};

export async function FindingList({ findings }: { findings: readonly Finding[] }) {
  const t = await getTranslations();

  return (
    <ul className="space-y-2">
      {findings.map((finding, index) => {
        const params = displayParams(finding.params, t);
        return (
          <li
            key={`${finding.code}-${index}`}
            className={`rounded-r-lg px-3 py-2 ${SEVERITY_STYLE[finding.severity]}`}
          >
            <p className="flex flex-wrap items-baseline gap-2 font-semibold">
              {t(`ai.finding.${finding.code}.title`, params)}
              <span className="text-xs font-semibold tracking-wide text-[var(--color-ink-soft)] uppercase">
                {t(`ai.severity.${finding.severity}`)}
              </span>
            </p>
            <p className="text-sm">{t(`ai.finding.${finding.code}.detail`, params)}</p>
          </li>
        );
      })}
    </ul>
  );
}

export async function PointList({
  points,
  tone,
}: {
  points: readonly Point[];
  tone: "for" | "against";
}) {
  const t = await getTranslations();
  const marker = tone === "for" ? "text-[var(--color-ok)]" : "text-[var(--color-warn)]";

  return (
    <ul className="space-y-1.5">
      {points.map((point, index) => (
        <li key={`${point.code}-${index}`} className="flex gap-2">
          <span aria-hidden className={`font-bold ${marker}`}>
            {tone === "for" ? "+" : "−"}
          </span>
          <span>{t(`ai.point.${point.code}`, displayParams(point.params, t))}</span>
        </li>
      ))}
    </ul>
  );
}

export async function SuggestionBox({ suggestion }: { suggestion: Suggestion }) {
  const t = await getTranslations();

  return (
    <div className="rounded-lg border border-[var(--color-brand)] bg-[var(--color-brand-soft)] p-3">
      <p className="flex flex-wrap items-baseline gap-x-3 font-semibold">
        <span className="text-sm text-[var(--color-ink-soft)]">{t("ai.suggestion")}:</span>
        <span>{suggestion.action ? t(`action.${suggestion.action}`) : t("common.none")}</span>
        <span className="chip bg-[var(--color-card)] text-[var(--color-ink-soft)]">
          {t("ai.confidenceLabel", { level: t(`ai.confidence.${suggestion.confidence}`) })}
        </span>
      </p>
      <p className="text-sm">
        {t(`ai.reason.${suggestion.reasonCode}`, displayParams(suggestion.reasonParams, t))}
      </p>
    </div>
  );
}
