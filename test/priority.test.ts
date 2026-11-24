import { describe, expect, it } from "vitest";

import {
  deadlineFromSubmission,
  deadlineState,
  MS_PER_DAY,
  rankApplications,
  type RankableApplication,
} from "@/lib/priority";
import { SLA_DAYS } from "@/lib/workflow";

const NOW = new Date("2026-11-24T10:00:00+05:30");

function at(days: number): Date {
  return new Date(NOW.getTime() + days * MS_PER_DAY);
}

describe("deadline status", () => {
  it("gives the service window from the submission date", () => {
    const submitted = new Date("2026-11-01T10:00:00+05:30");
    expect(deadlineFromSubmission(submitted).getTime() - submitted.getTime()).toBe(
      SLA_DAYS * MS_PER_DAY,
    );
  });

  it("treats a file past its deadline by only a few hours as one day overdue", () => {
    // Regression: rounding this to zero showed a breached file as "urgent"
    // rather than overdue, and hid it from the overdue count.
    const state = deadlineState(at(-2 / 24), NOW);
    expect(state.status).toBe("overdue");
    expect(state.daysOverdue).toBe(1);
    expect(state.daysRemaining).toBe(-1);
  });

  it("counts whole days once the deadline is well past", () => {
    expect(deadlineState(at(-2), NOW).daysOverdue).toBe(2);
    expect(deadlineState(at(-1.5), NOW).daysOverdue).toBe(2);
    expect(deadlineState(at(-9.1), NOW).daysOverdue).toBe(10);
  });

  it("treats the exact deadline instant as overdue", () => {
    const state = deadlineState(NOW, NOW);
    expect(state.status).toBe("overdue");
    expect(state.daysOverdue).toBe(1);
  });

  it("grades the days that are left", () => {
    expect(deadlineState(at(0.5), NOW).status).toBe("urgent");
    expect(deadlineState(at(1.9), NOW).status).toBe("due_soon");
    expect(deadlineState(at(2), NOW).status).toBe("due_soon");
    expect(deadlineState(at(2.1), NOW).status).toBe("on_track");
    expect(deadlineState(at(14.9), NOW).daysRemaining).toBe(15);
  });

  it("reports a paused clock instead of a count", () => {
    const state = deadlineState(at(-30), NOW, { paused: true });
    expect(state.status).toBe("paused");
    expect(state.daysOverdue).toBe(0);
  });
});

describe("dashboard order", () => {
  function app(partial: Partial<RankableApplication> & { id: number }): RankableApplication {
    return {
      stage: "scrutiny",
      deadlineAt: at(10),
      clockPausedAt: null,
      riskScore: 0,
      findingCount: 0,
      ...partial,
    };
  }

  it("puts the most urgent file first and paused files last", () => {
    const ordered = rankApplications(
      [
        app({ id: 1, deadlineAt: at(9) }),
        app({ id: 2, deadlineAt: at(-30), clockPausedAt: at(-5) }),
        app({ id: 3, deadlineAt: at(1) }),
        app({ id: 4, deadlineAt: at(-2) }),
        app({ id: 5, deadlineAt: at(2) }),
      ],
      NOW,
    );
    expect(ordered.map((row) => row.id)).toEqual([4, 3, 5, 1, 2]);
  });

  it("puts the file that is most overdue above one that is less overdue", () => {
    const ordered = rankApplications(
      [app({ id: 1, deadlineAt: at(-1) }), app({ id: 2, deadlineAt: at(-6) })],
      NOW,
    );
    expect(ordered.map((row) => row.id)).toEqual([2, 1]);
  });

  it("breaks a tie on urgency with the number of problems found", () => {
    const ordered = rankApplications(
      [
        app({ id: 1, deadlineAt: at(10), findingCount: 0 }),
        app({ id: 2, deadlineAt: at(10), findingCount: 2 }),
        app({ id: 3, deadlineAt: at(10), findingCount: 1, riskScore: 30 }),
      ],
      NOW,
    );
    expect(ordered.map((row) => row.id)).toEqual([2, 3, 1]);
  });

  it("does not change the array it was given", () => {
    const input = [app({ id: 1, deadlineAt: at(10) }), app({ id: 2, deadlineAt: at(-1) })];
    rankApplications(input, NOW);
    expect(input.map((row) => row.id)).toEqual([1, 2]);
  });
});
