import { getTranslations } from "next-intl/server";

import { deadlineState, type DeadlineStatus } from "@/lib/priority";

const CHIP_STYLE: Record<DeadlineStatus, string> = {
  overdue: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  urgent: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  due_soon: "bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
  on_track: "bg-[var(--color-ok-soft)] text-[var(--color-ok)]",
  paused: "bg-[var(--color-info-soft)] text-[var(--color-ink-soft)]",
};

export async function DeadlineChip({
  deadlineAt,
  paused,
  now,
}: {
  deadlineAt: Date;
  paused: boolean;
  now: Date;
}) {
  const t = await getTranslations("deadline");
  const state = deadlineState(deadlineAt, now, { paused });

  const text =
    state.status === "paused"
      ? t("paused")
      : state.status === "overdue"
        ? t("daysOverdue", { days: state.daysOverdue })
        : t("daysLeft", { days: state.daysRemaining });

  return (
    <span className={`chip ${CHIP_STYLE[state.status]}`}>
      <span className="sr-only">{t(`status.${state.status}`)}: </span>
      {text}
    </span>
  );
}
