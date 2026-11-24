import { describe, expect, it } from "vitest";

import {
  allowedActions,
  stagesOwnedBy,
  stepNumber,
  validateTransition,
} from "@/lib/workflow";

const CLERK = ["clerk"] as const;
const TALATHI = ["talathi"] as const;
const OFFICER = ["officer"] as const;
const ALL = ["clerk", "talathi", "officer"] as const;

describe("who can act", () => {
  it("offers each desk only the actions for its own step", () => {
    expect(allowedActions("scrutiny", CLERK).map((a) => a.action)).toEqual([
      "send_for_field",
      "return_to_applicant",
    ]);
    expect(allowedActions("field", TALATHI).map((a) => a.action)).toEqual([
      "send_for_decision",
      "send_back_to_scrutiny",
    ]);
    expect(allowedActions("decision", OFFICER).map((a) => a.action)).toEqual([
      "approve",
      "return_to_applicant",
      "send_for_reverification",
      "reject",
    ]);
  });

  it("offers nothing on another desk's step", () => {
    expect(allowedActions("field", CLERK)).toEqual([]);
    expect(allowedActions("decision", TALATHI)).toEqual([]);
    expect(allowedActions("scrutiny", OFFICER)).toEqual([]);
  });

  it("offers nothing once the file is closed, whatever the role", () => {
    expect(allowedActions("closed", ALL)).toEqual([]);
  });

  it("refuses an action from a role that does not own the step", () => {
    const result = validateTransition({
      stage: "decision",
      roles: CLERK,
      action: "approve",
    });
    expect(result).toEqual({ ok: false, error: "NOT_YOUR_STEP" });
  });

  it("refuses an action that does not belong to the current step", () => {
    const result = validateTransition({
      stage: "scrutiny",
      roles: ALL,
      action: "approve",
    });
    expect(result).toEqual({ ok: false, error: "INVALID_ACTION" });
  });
});

describe("remarks", () => {
  it("requires remarks when returning a file", () => {
    expect(
      validateTransition({ stage: "scrutiny", roles: CLERK, action: "return_to_applicant" }),
    ).toEqual({ ok: false, error: "REMARKS_REQUIRED" });
  });

  it("does not accept whitespace as remarks", () => {
    expect(
      validateTransition({
        stage: "decision",
        roles: OFFICER,
        action: "reject",
        remarks: "   \n  ",
      }),
    ).toEqual({ ok: false, error: "REMARKS_REQUIRED" });
  });

  it("does not require remarks when sending a complete file onward", () => {
    const result = validateTransition({
      stage: "scrutiny",
      roles: CLERK,
      action: "send_for_field",
    });
    expect(result.ok).toBe(true);
  });
});

describe("reaching the decision desk", () => {
  const base = { stage: "field", roles: TALATHI, action: "send_for_decision" } as const;

  it("needs both the report and the verified income", () => {
    const result = validateTransition({
      ...base,
      fieldReport: "पंचनामा...",
      verifiedAnnualIncome: 65000,
    });
    expect(result.ok).toBe(true);
  });

  it("refuses when the report is missing", () => {
    expect(validateTransition({ ...base, verifiedAnnualIncome: 65000 })).toEqual({
      ok: false,
      error: "FIELD_REPORT_REQUIRED",
    });
  });

  it("refuses when the verified income was cleared", () => {
    expect(
      validateTransition({ ...base, fieldReport: "पंचनामा...", verifiedAnnualIncome: null }),
    ).toEqual({ ok: false, error: "FIELD_REPORT_REQUIRED" });
  });

  it("accepts a verified income of zero, which is a real answer", () => {
    const result = validateTransition({
      ...base,
      fieldReport: "पंचनामा...",
      verifiedAnnualIncome: 0,
    });
    expect(result.ok).toBe(true);
  });
});

describe("two people on the same file", () => {
  it("refuses an action aimed at a step the file has already left", () => {
    expect(
      validateTransition({
        stage: "field",
        roles: ALL,
        action: "send_for_field",
        expectedStage: "scrutiny",
      }),
    ).toEqual({ ok: false, error: "STAGE_CHANGED" });
  });
});

describe("clock handling", () => {
  it("pauses the clock when the file goes to the applicant", () => {
    const result = validateTransition({
      stage: "scrutiny",
      roles: CLERK,
      action: "return_to_applicant",
      remarks: "रहिवासाचा पुरावा जोडावा",
    });
    expect(result.ok && result.spec.pausesClock).toBe(true);
  });

  it("restarts the clock when the applicant complies", () => {
    const result = validateTransition({
      stage: "with_applicant",
      roles: CLERK,
      action: "applicant_complied",
    });
    expect(result.ok && result.spec.restartsClock).toBe(true);
  });
});

describe("step numbering", () => {
  it("counts a file sitting with the applicant as still at step 1", () => {
    expect(stepNumber("scrutiny")).toBe(1);
    expect(stepNumber("with_applicant")).toBe(1);
    expect(stepNumber("field")).toBe(2);
    expect(stepNumber("decision")).toBe(3);
    expect(stepNumber("closed")).toBe(3);
  });

  it("gives the clerk both of their stages", () => {
    expect(stagesOwnedBy(CLERK)).toEqual(["scrutiny", "with_applicant"]);
    expect(stagesOwnedBy(OFFICER)).toEqual(["decision"]);
  });
});
