import { SLA_DAYS } from "./workflow";
import type { Stage } from "@/db/schema";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DeadlineStatus =
  | "overdue"
  | "urgent"
  | "due_soon"
  | "on_track"
  | "paused";

export type Deadline = {
  status: DeadlineStatus;
  /** Whole days left. 0 means the deadline falls today. Negative once overdue. */
  daysRemaining: number;
  /** Whole days past the deadline; at least 1 once the deadline has passed. */
  daysOverdue: number;
};

/**
 * How a file sits against its deadline.
 *
 * Anything past the deadline counts as at least one day overdue. An application
 * whose date passed two hours ago is late, not "due today" — rounding that to
 * zero would hide breaches from the dashboard.
 */
export function deadlineState(
  deadlineAt: Date,
  now: Date,
  options: { paused?: boolean } = {},
): Deadline {
  if (options.paused) {
    return { status: "paused", daysRemaining: 0, daysOverdue: 0 };
  }

  const diffMs = deadlineAt.getTime() - now.getTime();

  if (diffMs <= 0) {
    const daysOverdue = Math.max(1, Math.ceil(-diffMs / MS_PER_DAY));
    return { status: "overdue", daysRemaining: -daysOverdue, daysOverdue };
  }

  // Rounded up, so a file with fourteen and a half days left reads as 15 rather
  // than looking as if a day went missing the moment the clock started.
  const daysRemaining = Math.ceil(diffMs / MS_PER_DAY);
  const status: DeadlineStatus =
    daysRemaining <= 1 ? "urgent" : daysRemaining <= 2 ? "due_soon" : "on_track";

  return { status, daysRemaining, daysOverdue: 0 };
}

export function deadlineFromSubmission(submittedAt: Date): Date {
  return new Date(submittedAt.getTime() + SLA_DAYS * MS_PER_DAY);
}

const STATUS_WEIGHT: Record<DeadlineStatus, number> = {
  overdue: 0,
  urgent: 1,
  due_soon: 2,
  on_track: 3,
  paused: 4,
};

export type RankableApplication = {
  id: number;
  stage: Stage;
  deadlineAt: Date;
  clockPausedAt: Date | null;
  riskScore: number;
  findingCount: number;
};

/**
 * Dashboard order: whatever is closest to breaching the deadline first, and
 * within the same urgency the file with the most problems found.
 */
export function rankApplications<T extends RankableApplication>(
  applications: readonly T[],
  now: Date,
): T[] {
  return [...applications].sort((a, b) => {
    const da = deadlineState(a.deadlineAt, now, {
      paused: Boolean(a.clockPausedAt),
    });
    const db = deadlineState(b.deadlineAt, now, {
      paused: Boolean(b.clockPausedAt),
    });

    const weight = STATUS_WEIGHT[da.status] - STATUS_WEIGHT[db.status];
    if (weight !== 0) return weight;

    if (da.status === "overdue" && da.daysOverdue !== db.daysOverdue) {
      return db.daysOverdue - da.daysOverdue;
    }

    if (a.findingCount !== b.findingCount) return b.findingCount - a.findingCount;
    if (a.riskScore !== b.riskScore) return b.riskScore - a.riskScore;

    const byDeadline = a.deadlineAt.getTime() - b.deadlineAt.getTime();
    return byDeadline !== 0 ? byDeadline : a.id - b.id;
  });
}

/** Days between two instants, rounded to one decimal. Used by the metrics page. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round(((to.getTime() - from.getTime()) / MS_PER_DAY) * 10) / 10;
}
