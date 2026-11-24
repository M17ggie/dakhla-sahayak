import type { Role, Stage } from "@/db/schema";

/**
 * Service deadline in days under the Maharashtra Right to Public Services Act.
 *
 * NOTE: 15 days is this demo's figure and has not been checked against the
 * notified list of services. It is one constant so the department can set it.
 */
export const SLA_DAYS = 15;

/** Which desk owns each stage. A file can only be acted on by its owner. */
export const STAGE_OWNER: Record<Stage, Role | null> = {
  scrutiny: "clerk",
  with_applicant: "clerk",
  field: "talathi",
  decision: "officer",
  closed: null,
};

export const ACTIONS = [
  "send_for_field",
  "return_to_applicant",
  "applicant_complied",
  "send_for_decision",
  "send_back_to_scrutiny",
  "approve",
  "reject",
  "send_for_reverification",
] as const;
export type Action = (typeof ACTIONS)[number];

export type ActionSpec = {
  action: Action;
  from: Stage;
  to: Stage;
  role: Role;
  /** Returning or refusing a file always has to say why. */
  requiresRemarks: boolean;
  /** Reaching the decision desk needs the field work to be on file. */
  requiresFieldReport?: boolean;
  /** Restart the deadline clock: the file comes back as new work. */
  restartsClock?: boolean;
  /** The citizen now holds the file, so the clock stops. */
  pausesClock?: boolean;
  /** Visual weight on the detail screen. */
  intent: "primary" | "caution" | "danger";
};

export const ACTION_SPECS: Record<Action, ActionSpec> = {
  send_for_field: {
    action: "send_for_field",
    from: "scrutiny",
    to: "field",
    role: "clerk",
    requiresRemarks: false,
    intent: "primary",
  },
  return_to_applicant: {
    // Available at two desks; specFor() resolves the right one per stage.
    action: "return_to_applicant",
    from: "scrutiny",
    to: "with_applicant",
    role: "clerk",
    requiresRemarks: true,
    pausesClock: true,
    intent: "caution",
  },
  applicant_complied: {
    action: "applicant_complied",
    from: "with_applicant",
    to: "scrutiny",
    role: "clerk",
    requiresRemarks: false,
    restartsClock: true,
    intent: "primary",
  },
  send_for_decision: {
    action: "send_for_decision",
    from: "field",
    to: "decision",
    role: "talathi",
    requiresRemarks: false,
    requiresFieldReport: true,
    intent: "primary",
  },
  send_back_to_scrutiny: {
    action: "send_back_to_scrutiny",
    from: "field",
    to: "scrutiny",
    role: "talathi",
    requiresRemarks: true,
    intent: "caution",
  },
  approve: {
    action: "approve",
    from: "decision",
    to: "closed",
    role: "officer",
    requiresRemarks: false,
    intent: "primary",
  },
  reject: {
    action: "reject",
    from: "decision",
    to: "closed",
    role: "officer",
    requiresRemarks: true,
    intent: "danger",
  },
  send_for_reverification: {
    action: "send_for_reverification",
    from: "decision",
    to: "field",
    role: "officer",
    requiresRemarks: true,
    intent: "caution",
  },
};

/** The officer can also hand the file back to the citizen, from their own stage. */
const OFFICER_RETURN: ActionSpec = {
  ...ACTION_SPECS.return_to_applicant,
  from: "decision",
  role: "officer",
};

function specFor(action: Action, stage: Stage): ActionSpec | null {
  if (action === "return_to_applicant") {
    if (stage === "scrutiny") return ACTION_SPECS.return_to_applicant;
    if (stage === "decision") return OFFICER_RETURN;
    return null;
  }
  const spec = ACTION_SPECS[action];
  return spec && spec.from === stage ? spec : null;
}

const ACTIONS_BY_STAGE: Record<Stage, ActionSpec[]> = {
  scrutiny: [ACTION_SPECS.send_for_field, ACTION_SPECS.return_to_applicant],
  with_applicant: [ACTION_SPECS.applicant_complied],
  field: [ACTION_SPECS.send_for_decision, ACTION_SPECS.send_back_to_scrutiny],
  decision: [
    ACTION_SPECS.approve,
    OFFICER_RETURN,
    ACTION_SPECS.send_for_reverification,
    ACTION_SPECS.reject,
  ],
  closed: [],
};

/** The buttons a given user may press on a file at a given stage, in display order. */
export function allowedActions(stage: Stage, roles: readonly Role[]): ActionSpec[] {
  return ACTIONS_BY_STAGE[stage].filter((spec) => roles.includes(spec.role));
}

export type ValidationError =
  | "NOT_YOUR_STEP"
  | "INVALID_ACTION"
  | "REMARKS_REQUIRED"
  | "FIELD_REPORT_REQUIRED"
  | "STAGE_CHANGED";

export type TransitionInput = {
  stage: Stage;
  roles: readonly Role[];
  action: Action;
  remarks?: string | null;
  fieldReport?: string | null;
  verifiedAnnualIncome?: number | null;
  /** The stage the screen was rendered against, if the client sent one. */
  expectedStage?: Stage | null;
};

export type TransitionResult =
  | { ok: true; spec: ActionSpec }
  | { ok: false; error: ValidationError };

/**
 * The single gate every action passes through. Pure, so the rules can be read
 * and tested without a database.
 */
export function validateTransition(input: TransitionInput): TransitionResult {
  if (input.expectedStage && input.expectedStage !== input.stage) {
    return { ok: false, error: "STAGE_CHANGED" };
  }

  const spec = specFor(input.action, input.stage);
  if (!spec) return { ok: false, error: "INVALID_ACTION" };

  if (!input.roles.includes(spec.role)) {
    return { ok: false, error: "NOT_YOUR_STEP" };
  }

  if (spec.requiresRemarks && !input.remarks?.trim()) {
    return { ok: false, error: "REMARKS_REQUIRED" };
  }

  if (spec.requiresFieldReport) {
    const hasReport = Boolean(input.fieldReport?.trim());
    const income = input.verifiedAnnualIncome;
    const hasIncome =
      typeof income === "number" && Number.isFinite(income) && income >= 0;
    if (!hasReport || !hasIncome) {
      return { ok: false, error: "FIELD_REPORT_REQUIRED" };
    }
  }

  return { ok: true, spec };
}

/** Stages that still need someone at this office to act. */
export function isOpen(stage: Stage): boolean {
  return stage !== "closed";
}

/** A file sitting with the citizen is in nobody's queue. */
export function isWithApplicant(stage: Stage): boolean {
  return stage === "with_applicant";
}

/** The stages whose work belongs to these roles. */
export function stagesOwnedBy(roles: readonly Role[]): Stage[] {
  return (Object.keys(STAGE_OWNER) as Stage[]).filter((stage) => {
    const owner = STAGE_OWNER[stage];
    return owner !== null && roles.includes(owner);
  });
}

/** The step number shown to the user; `with_applicant` belongs to step 1. */
export function stepNumber(stage: Stage): 1 | 2 | 3 {
  if (stage === "field") return 2;
  if (stage === "decision" || stage === "closed") return 3;
  return 1;
}
