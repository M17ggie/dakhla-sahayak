import { getTranslations } from "next-intl/server";

import type { Event } from "@/db/schema";
import { formatDateTime } from "@/i18n/format";
import { resolveLocale } from "@/i18n/request";

/**
 * Who did what, when, and whether they went with the assistant.
 *
 * The override line is the point of this panel: an income certificate can be
 * appealed, and the file has to show that a person decided, not a rule.
 */
export async function HistoryPanel({
  events,
}: {
  events: Array<Event & { actorName: string | null }>;
}) {
  const t = await getTranslations();
  const locale = await resolveLocale();

  return (
    <section className="card p-4" aria-labelledby="history-heading">
      <h2 id="history-heading" className="mb-3 text-lg font-semibold">
        {t("history.heading")}
      </h2>

      {events.length === 0 ? (
        <p className="text-[var(--color-ink-soft)]">{t("history.empty")}</p>
      ) : (
        <ol className="space-y-3 border-l-2 border-[var(--color-line)] pl-4">
          {events.map((event) => (
            <li key={event.id} className="relative">
              <span
                aria-hidden
                className="absolute top-2.5 -left-[1.3rem] size-2.5 rounded-full bg-[var(--color-line)]"
              />
              <p className="text-sm text-[var(--color-ink-soft)]">
                {formatDateTime(event.createdAt, locale)}
              </p>
              <p className="font-semibold">
                {event.type === "submitted"
                  ? t("history.submitted")
                  : event.type === "ai_run"
                    ? t("history.aiRun", { score: event.aiRiskScore ?? 0 })
                    : t(`action.${event.action}`)}
              </p>

              {event.type === "transition" && event.fromStage && event.toStage ? (
                <p className="text-sm text-[var(--color-ink-soft)]">
                  {t("history.transition", {
                    from: t(`stage.${event.fromStage}`),
                    to: t(`stage.${event.toStage}`),
                  })}
                </p>
              ) : null}

              <p className="text-sm text-[var(--color-ink-soft)]">
                {event.actorRole && event.actorName
                  ? t("history.by", {
                      role: t(`role.${event.actorRole}`),
                      name: event.actorName,
                    })
                  : t("history.bySystem")}
              </p>

              {event.remarks ? (
                <p className="mt-1 rounded-lg bg-[var(--color-info-soft)] px-3 py-2 text-sm whitespace-pre-wrap">
                  {t("history.remarks", { text: event.remarks })}
                </p>
              ) : null}

              {event.type === "transition" && event.aiSuggestedAction ? (
                <p
                  className={`mt-1 text-sm font-semibold ${
                    event.followedAi
                      ? "text-[var(--color-ok)]"
                      : "text-[var(--color-warn)]"
                  }`}
                >
                  {event.followedAi
                    ? t("history.followedAi")
                    : t("history.divergedAi", {
                        suggested: t(`action.${event.aiSuggestedAction}`),
                      })}
                </p>
              ) : null}

              {event.type === "ai_run" && event.aiSuggestedAction ? (
                <p className="text-sm text-[var(--color-ink-soft)]">
                  {t("history.aiSuggested", {
                    suggested: t(`action.${event.aiSuggestedAction}`),
                  })}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
