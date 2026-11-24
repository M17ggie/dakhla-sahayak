import type { Occupation } from "@/db/schema";
import type { Action } from "@/lib/workflow";
import type { Deadline } from "@/lib/priority";
import {
  checkDocuments,
  compareVerifiedIncome,
  FIELD_INCOME_TOLERANCE,
  latestByType,
  type ApplicationFacts,
  type ChecklistRow,
  type DocumentFacts,
  type FieldIncomeComparison,
  type Finding,
} from "./rules";

/**
 * The one interface the screens talk to.
 *
 * Everything below is deterministic rules over the file's own data. Results are
 * returned as codes plus parameters, never as prose, so they can be rendered in
 * the reader's language and stored in the audit trail without losing meaning.
 * Swapping in a self-hosted language model later means reimplementing these
 * functions; no screen has to change.
 */

export type Confidence = "high" | "medium" | "low";

export type Suggestion = {
  /** The button the AI would press. Shown outlined; the officer still chooses. */
  action: Action | null;
  confidence: Confidence;
  /** Message key suffix under `ai.reason`. */
  reasonCode: string;
  reasonParams: Record<string, string | number>;
};

export type Point = {
  code: string;
  params: Record<string, string | number>;
};

/* ------------------------------------------------------------------ step 1 */

export type ScrutinyAssessment = {
  step: "scrutiny";
  riskScore: number;
  findings: Finding[];
  checklist: ChecklistRow[];
  /** The subset the citizen can act on; these become the SMS. */
  actionableFindings: Finding[];
  suggestion: Suggestion;
};

export function assessScrutiny(
  application: ApplicationFacts,
  documents: readonly DocumentFacts[],
): ScrutinyAssessment {
  const { findings, checklist, riskScore } = checkDocuments(application, documents);
  const actionableFindings = findings.filter((finding) => finding.fixableByApplicant);

  const suggestion: Suggestion = actionableFindings.length
    ? {
        action: "return_to_applicant",
        // One missing paper is plain; a name that differs rests on a comparison.
        confidence: actionableFindings.every((f) => f.code === "missing_document")
          ? "high"
          : "medium",
        reasonCode: "return_for_documents",
        reasonParams: { count: actionableFindings.length },
      }
    : {
        action: "send_for_field",
        confidence: riskScore === 0 ? "high" : "medium",
        reasonCode: riskScore === 0 ? "documents_in_order" : "settle_on_visit",
        reasonParams: { riskScore },
      };

  return {
    step: "scrutiny",
    riskScore,
    findings,
    checklist,
    actionableFindings,
    suggestion,
  };
}

/** Findings worth counting on the dashboard; the informational note is not one. */
export function countableFindings(findings: readonly Finding[]): number {
  return findings.filter((finding) => finding.severity !== "info").length;
}

/* ------------------------------------------------------------------ step 2 */

export type VisitCheckItem = {
  code: string;
  params: Record<string, string | number>;
  /** Raised by a step 1 finding rather than being part of every visit. */
  fromFinding: boolean;
};

const OCCUPATION_CHECK: Record<Occupation, string> = {
  farmer: "inspect_land",
  salaried: "confirm_employment",
  business: "visit_business",
  labour: "ask_wage_pattern",
};

/** What the Talathi should establish on this particular visit. */
export function buildVisitChecklist(
  application: ApplicationFacts,
  documents: readonly DocumentFacts[],
  findings: readonly Finding[],
): VisitCheckItem[] {
  const items: VisitCheckItem[] = [
    { code: "confirm_residence", params: { village: application.village }, fromFinding: false },
    {
      code: "confirm_family_size",
      params: { declared: application.declaredFamilyMembers },
      fromFinding: false,
    },
  ];

  const land = latestByType(documents).get("land_7_12");
  if (application.occupation === "farmer" && land?.landAreaCentiHectares) {
    items.push({
      code: "inspect_land",
      params: { areaHectares: land.landAreaCentiHectares / 100 },
      fromFinding: false,
    });
  } else {
    items.push({
      code: OCCUPATION_CHECK[application.occupation],
      params: {},
      fromFinding: false,
    });
  }

  for (const finding of findings) {
    if (finding.code === "income_above_declared") {
      items.push({
        code: "ask_about_document_income",
        params: {
          documentIncome: Number(finding.params.documentIncome),
          docType: String(finding.params.docType),
        },
        fromFinding: true,
      });
    }
    if (finding.code === "land_income_doubt") {
      items.push({
        code: "ask_about_land_yield",
        params: {
          areaHectares: Number(finding.params.areaHectares),
          estimatedIncome: Number(finding.params.estimatedIncome),
        },
        fromFinding: true,
      });
    }
    if (finding.code === "name_mismatch" || finding.code === "name_variation") {
      items.push({
        code: "confirm_identity",
        params: { nameOnDocument: String(finding.params.nameOnDocument) },
        fromFinding: true,
      });
    }
    if (finding.code === "address_outside_village") {
      items.push({
        code: "confirm_address",
        params: { addressOnDocument: String(finding.params.addressOnDocument) },
        fromFinding: true,
      });
    }
  }

  items.push({ code: "ask_other_earners", params: {}, fromFinding: false });
  items.push({ code: "note_assets", params: {}, fromFinding: false });
  items.push({ code: "record_panch", params: {}, fromFinding: false });

  return items;
}

export type FieldVisitInput = {
  residenceConfirmed: boolean;
  verifiedFamilyMembers: number;
  verifiedAnnualIncome: number;
  incomeSources: string;
  assets: string;
  panchNames: string;
};

export type PanchnamaDraft = {
  /** Message key under `ai.panchnama`, rendered by the screen. */
  templateCode: "panchnama";
  params: Record<string, string | number>;
};

/**
 * The formal Marathi panchnama, assembled from the short form the Talathi
 * filled in on the phone. The Talathi edits it before it is filed.
 */
export function draftPanchnama(
  application: ApplicationFacts,
  visit: FieldVisitInput,
  context: { visitDate: string; talathiName: string },
): PanchnamaDraft {
  return {
    templateCode: "panchnama",
    params: {
      visitDate: context.visitDate,
      talathiName: context.talathiName,
      applicantName: application.applicantName,
      village: application.village,
      occupation: application.occupation,
      residence: visit.residenceConfirmed ? "confirmed" : "not_confirmed",
      familyMembers: visit.verifiedFamilyMembers,
      verifiedIncome: visit.verifiedAnnualIncome,
      declaredIncome: application.declaredAnnualIncome,
      incomeSources: visit.incomeSources.trim(),
      assets: visit.assets.trim(),
      panchNames: visit.panchNames.trim(),
    },
  };
}

export type FieldAssessment = {
  step: "field";
  checklist: VisitCheckItem[];
  income: FieldIncomeComparison | null;
  notes: Point[];
  suggestion: Suggestion;
};

export function assessField(
  application: ApplicationFacts,
  documents: readonly DocumentFacts[],
  findings: readonly Finding[],
  visit: Partial<FieldVisitInput>,
): FieldAssessment {
  const checklist = buildVisitChecklist(application, documents, findings);
  const notes: Point[] = [];

  const income =
    typeof visit.verifiedAnnualIncome === "number"
      ? compareVerifiedIncome(application.declaredAnnualIncome, visit.verifiedAnnualIncome)
      : null;

  if (visit.residenceConfirmed === false) {
    notes.push({ code: "residence_not_confirmed", params: {} });
  }
  if (income && income.code !== "field_income_matches") {
    notes.push({ code: income.code, params: { gapPercent: income.gapPercent } });
  }

  // The Talathi records what was found either way; the officer decides on it.
  const suggestion: Suggestion = {
    action: "send_for_decision",
    confidence: notes.length ? "medium" : "high",
    reasonCode: notes.length ? "findings_for_officer" : "visit_complete",
    reasonParams: { notes: notes.length },
  };

  return { step: "field", checklist, income, notes, suggestion };
}

/* ------------------------------------------------------------------ step 3 */

export type DecisionBrief = {
  step: "decision";
  pointsFor: Point[];
  pointsAgainst: Point[];
  income: FieldIncomeComparison | null;
  suggestion: Suggestion;
  /** Message key under `ai.order`, rendered by the screen. */
  orderTemplate: "approve" | "reject" | "return";
  orderParams: Record<string, string | number>;
};

export type DecisionInput = {
  application: ApplicationFacts;
  findings: readonly Finding[];
  checklist: readonly ChecklistRow[];
  residenceConfirmed: boolean | null;
  verifiedAnnualIncome: number | null;
  verifiedFamilyMembers: number | null;
  fieldReport: string | null;
  deadline: Deadline;
  certificateNumber: string;
  officerName: string;
  decisionDate: string;
};

export function buildDecisionBrief(input: DecisionInput): DecisionBrief {
  const { application, findings, checklist, deadline } = input;
  const pointsFor: Point[] = [];
  const pointsAgainst: Point[] = [];

  if (checklist.every((row) => row.present)) {
    pointsFor.push({ code: "documents_complete", params: { count: checklist.length } });
  } else {
    pointsAgainst.push({
      code: "documents_incomplete",
      params: { count: checklist.filter((row) => !row.present).length },
    });
  }

  if (input.residenceConfirmed === true) {
    pointsFor.push({ code: "residence_confirmed", params: { village: application.village } });
  } else if (input.residenceConfirmed === false) {
    pointsAgainst.push({ code: "residence_not_confirmed", params: {} });
  }

  const income =
    typeof input.verifiedAnnualIncome === "number"
      ? compareVerifiedIncome(application.declaredAnnualIncome, input.verifiedAnnualIncome)
      : null;

  if (income) {
    if (income.code === "field_income_matches") {
      pointsFor.push({
        code: "income_verified_matches",
        params: {
          verifiedIncome: income.verifiedIncome,
          gapPercent: income.gapPercent,
        },
      });
    } else {
      pointsAgainst.push({
        code: "income_gap",
        params: {
          verifiedIncome: income.verifiedIncome,
          declaredIncome: income.declaredIncome,
          gapPercent: income.gapPercent,
        },
      });
    }
  }

  if (input.fieldReport?.trim()) {
    pointsFor.push({ code: "field_report_on_file", params: {} });
  }

  if (deadline.status === "overdue") {
    pointsAgainst.push({ code: "overdue", params: { days: deadline.daysOverdue } });
  }

  for (const finding of findings) {
    if (finding.severity === "high") {
      pointsAgainst.push({ code: "open_finding", params: { finding: finding.code } });
    }
  }

  let suggestion: Suggestion;
  let orderTemplate: DecisionBrief["orderTemplate"];

  if (input.residenceConfirmed === false) {
    suggestion = {
      action: "reject",
      confidence: "high",
      reasonCode: "not_a_resident",
      reasonParams: { village: application.village },
    };
    orderTemplate = "reject";
  } else if (income && income.gapPercent > FIELD_INCOME_TOLERANCE * 100) {
    suggestion = {
      action: "return_to_applicant",
      confidence: "medium",
      reasonCode: "revised_declaration_needed",
      reasonParams: {
        gapPercent: income.gapPercent,
        verifiedIncome: income.verifiedIncome,
      },
    };
    orderTemplate = "return";
  } else {
    suggestion = {
      action: "approve",
      confidence: pointsAgainst.length === 0 ? "high" : "medium",
      reasonCode: pointsAgainst.length === 0 ? "all_checks_passed" : "approve_with_notes",
      reasonParams: { against: pointsAgainst.length },
    };
    orderTemplate = "approve";
  }

  const certifiedIncome = input.verifiedAnnualIncome ?? application.declaredAnnualIncome;

  return {
    step: "decision",
    pointsFor,
    pointsAgainst,
    income,
    suggestion,
    orderTemplate,
    orderParams: {
      applicantName: application.applicantName,
      village: application.village,
      certificateNumber: input.certificateNumber,
      certifiedIncome,
      declaredIncome: application.declaredAnnualIncome,
      familyMembers: input.verifiedFamilyMembers ?? application.declaredFamilyMembers,
      officerName: input.officerName,
      decisionDate: input.decisionDate,
      gapPercent: income?.gapPercent ?? 0,
    },
  };
}

export type { ApplicationFacts, ChecklistRow, DocumentFacts, Finding, FieldIncomeComparison };
