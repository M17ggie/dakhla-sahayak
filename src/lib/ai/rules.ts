import type { DocType, Occupation } from "@/db/schema";
import { addressMentionsVillage, compareNames } from "./name-match";

/**
 * The rule set behind the assistance on screen.
 *
 * Every rule returns a code plus the numbers it was based on, never a sentence.
 * The wording comes from the message catalogue, so the same finding reads
 * correctly in Marathi and in English, and the reasoning stays auditable: a
 * citizen who appeals can be told exactly which comparison went against them.
 */

export type Severity = "high" | "medium" | "low" | "info";

export type Finding = {
  code: string;
  severity: Severity;
  /** Contribution to the risk score, 0..100 in total. */
  weight: number;
  /**
   * True when the citizen can clear it by bringing a paper to the counter.
   * Only these are worth returning a file for; the rest are settled on the visit.
   */
  fixableByApplicant: boolean;
  params: Record<string, string | number | boolean>;
};

/**
 * How far the income shown on a document may sit from the declared income
 * before it is worth asking about.
 *
 * NOTE: our own default, not a departmental rule. Salary slips are one month of
 * a varying year and land yield is an estimate, so some slack is needed.
 */
export const INCOME_TOLERANCE = 0.2;

/** The same idea after the field visit, where the figure is better evidenced. */
export const FIELD_INCOME_TOLERANCE = 0.25;

/**
 * Rough annual net income per hectare, used only to decide whether a land
 * holding is worth asking about on the visit. Demo figures; a real deployment
 * would use the taluka's own crop-wise rates.
 */
export const LAND_INCOME_PER_HECTARE = {
  irrigated: 85_000,
  rainfed: 35_000,
};

export type ApplicationFacts = {
  applicantName: string;
  applicantNameEn: string;
  village: string;
  villageEn: string;
  occupation: Occupation;
  declaredAnnualIncome: number;
  declaredFamilyMembers: number;
};

export type DocumentFacts = {
  docType: DocType;
  nameOnDocument?: string | null;
  addressOnDocument?: string | null;
  monthlyNetPay?: number | null;
  annualIncome?: number | null;
  landAreaCentiHectares?: number | null;
  irrigated?: boolean | null;
};

export type RequirementCode = "identity" | "residence" | "declaration" | "income_proof";

export type Requirement = {
  code: RequirementCode;
  /** Any one of these satisfies the requirement. */
  accepts: DocType[];
};

const INCOME_PROOF_BY_OCCUPATION: Record<Occupation, DocType[]> = {
  farmer: ["land_7_12"],
  salaried: ["salary_slip"],
  business: ["itr"],
  // Daily-wage work leaves no paper trail; the field visit is the evidence.
  labour: [],
};

/** What this applicant's file has to contain, given their occupation. */
export function requirementsFor(occupation: Occupation): Requirement[] {
  const requirements: Requirement[] = [
    { code: "identity", accepts: ["aadhaar"] },
    { code: "residence", accepts: ["ration_card", "electricity_bill"] },
    { code: "declaration", accepts: ["self_declaration"] },
  ];

  const incomeProof = INCOME_PROOF_BY_OCCUPATION[occupation];
  if (incomeProof.length > 0) {
    requirements.push({ code: "income_proof", accepts: incomeProof });
  }

  return requirements;
}

export type ChecklistRow = {
  code: RequirementCode;
  accepts: DocType[];
  present: boolean;
  /** Which of the accepted types was actually filed. */
  satisfiedBy: DocType | null;
};

export function buildChecklist(
  occupation: Occupation,
  documents: readonly DocumentFacts[],
): ChecklistRow[] {
  const filed = new Set(documents.map((doc) => doc.docType));

  return requirementsFor(occupation).map((requirement) => {
    const satisfiedBy = requirement.accepts.find((type) => filed.has(type)) ?? null;
    return {
      code: requirement.code,
      accepts: requirement.accepts,
      present: satisfiedBy !== null,
      satisfiedBy,
    };
  });
}

/** Percentage by which `actual` exceeds `declared`, rounded to whole percent. */
export function incomeGapPercent(declared: number, actual: number): number {
  if (declared <= 0) return actual > 0 ? 100 : 0;
  return Math.round(((actual - declared) / declared) * 100);
}

function annualFrom(doc: DocumentFacts): number | null {
  if (typeof doc.monthlyNetPay === "number" && doc.monthlyNetPay > 0) {
    return doc.monthlyNetPay * 12;
  }
  if (typeof doc.annualIncome === "number" && doc.annualIncome > 0) {
    return doc.annualIncome;
  }
  return null;
}

function estimateLandIncome(doc: DocumentFacts): number | null {
  if (typeof doc.landAreaCentiHectares !== "number" || doc.landAreaCentiHectares <= 0) {
    return null;
  }
  const hectares = doc.landAreaCentiHectares / 100;
  const rate = doc.irrigated
    ? LAND_INCOME_PER_HECTARE.irrigated
    : LAND_INCOME_PER_HECTARE.rainfed;
  return Math.round(hectares * rate);
}

/**
 * The newest document of each kind, keyed by type.
 *
 * Income is compared against the latest paper on file, not against every one of
 * them. A clerk who corrects a mis-read salary slip by filing the right figure
 * has to be able to clear the query; otherwise bad OCR could only ever be added
 * to, never fixed. Documents arrive oldest first.
 */
export function latestByType(
  documents: readonly DocumentFacts[],
): Map<DocType, DocumentFacts> {
  const latest = new Map<DocType, DocumentFacts>();
  for (const doc of documents) latest.set(doc.docType, doc);
  return latest;
}

/** Documents that carry a name worth comparing against Aadhaar. */
const NAME_BEARING: DocType[] = [
  "ration_card",
  "electricity_bill",
  "land_7_12",
  "salary_slip",
  "itr",
  "self_declaration",
];

/** Documents that carry an address worth checking against the village. */
const ADDRESS_BEARING: DocType[] = ["ration_card", "electricity_bill", "land_7_12"];

export type DocumentCheck = {
  findings: Finding[];
  checklist: ChecklistRow[];
  riskScore: number;
};

/**
 * Step 1: everything that can be decided from the papers alone.
 */
export function checkDocuments(
  application: ApplicationFacts,
  documents: readonly DocumentFacts[],
): DocumentCheck {
  const findings: Finding[] = [];
  const checklist = buildChecklist(application.occupation, documents);

  for (const row of checklist) {
    if (!row.present) {
      findings.push({
        code: "missing_document",
        severity: "high",
        weight: 30,
        fixableByApplicant: true,
        params: { requirement: row.code, accepts: row.accepts.join(",") },
      });
    }
  }

  // The name on Aadhaar is the reference; everything else is compared to it.
  const aadhaar = documents.find((doc) => doc.docType === "aadhaar");
  const referenceName = aadhaar?.nameOnDocument?.trim() || application.applicantName;

  for (const doc of documents) {
    if (!NAME_BEARING.includes(doc.docType)) continue;
    const name = doc.nameOnDocument?.trim();
    if (!name) continue;

    const comparison = compareNames(referenceName, name);
    if (comparison.verdict === "mismatch") {
      findings.push({
        code: "name_mismatch",
        severity: "high",
        weight: 30,
        fixableByApplicant: true,
        params: {
          docType: doc.docType,
          nameOnDocument: name,
          referenceName,
          score: comparison.score,
        },
      });
    } else if (comparison.verdict === "variation") {
      findings.push({
        code: "name_variation",
        severity: "low",
        weight: 5,
        fixableByApplicant: false,
        params: {
          docType: doc.docType,
          nameOnDocument: name,
          referenceName,
          score: comparison.score,
        },
      });
    }
  }

  for (const doc of documents) {
    if (!ADDRESS_BEARING.includes(doc.docType)) continue;
    const address = doc.addressOnDocument?.trim();
    if (!address) continue;

    if (!addressMentionsVillage(address, application.village)) {
      findings.push({
        code: "address_outside_village",
        severity: "high",
        weight: 25,
        fixableByApplicant: true,
        params: {
          docType: doc.docType,
          addressOnDocument: address,
          village: application.village,
        },
      });
    }
  }

  // Income shown on paper against the income declared on the form. Only the
  // newest document of each kind is compared; see latestByType.
  for (const doc of latestByType(documents).values()) {
    if (doc.docType === "salary_slip" || doc.docType === "itr") {
      const annual = annualFrom(doc);
      if (annual === null) continue;
      const gap = incomeGapPercent(application.declaredAnnualIncome, annual);
      if (gap > INCOME_TOLERANCE * 100) {
        findings.push({
          code: "income_above_declared",
          severity: "medium",
          weight: 35,
          // A field visit settles this better than another trip to the counter.
          fixableByApplicant: false,
          params: {
            docType: doc.docType,
            documentIncome: annual,
            declaredIncome: application.declaredAnnualIncome,
            gapPercent: gap,
          },
        });
      }
    }

    if (doc.docType === "land_7_12") {
      const estimated = estimateLandIncome(doc);
      if (estimated === null) continue;
      const gap = incomeGapPercent(application.declaredAnnualIncome, estimated);
      if (gap > INCOME_TOLERANCE * 100) {
        findings.push({
          code: "land_income_doubt",
          severity: "medium",
          weight: 20,
          fixableByApplicant: false,
          params: {
            areaHectares: (doc.landAreaCentiHectares ?? 0) / 100,
            irrigated: Boolean(doc.irrigated),
            estimatedIncome: estimated,
            declaredIncome: application.declaredAnnualIncome,
            gapPercent: gap,
          },
        });
      }
    }
  }

  // A note, not a problem: there is nothing to cross-check for daily-wage work.
  if (application.occupation === "labour") {
    findings.push({
      code: "labour_no_income_proof",
      severity: "info",
      weight: 0,
      fixableByApplicant: false,
      params: {},
    });
  }

  const riskScore = Math.min(
    100,
    findings.reduce((total, finding) => total + finding.weight, 0),
  );

  return { findings, checklist, riskScore };
}

export type FieldIncomeComparison = {
  code: "field_income_matches" | "field_income_above_declared" | "field_income_below_declared";
  gapPercent: number;
  declaredIncome: number;
  verifiedIncome: number;
};

/**
 * Step 2: the verified figure against the declared one. A gap inside the
 * tolerance counts as agreement.
 */
export function compareVerifiedIncome(
  declaredIncome: number,
  verifiedIncome: number,
): FieldIncomeComparison {
  const gapPercent = incomeGapPercent(declaredIncome, verifiedIncome);
  const tolerance = FIELD_INCOME_TOLERANCE * 100;

  const code =
    gapPercent > tolerance
      ? "field_income_above_declared"
      : gapPercent < -tolerance
        ? "field_income_below_declared"
        : "field_income_matches";

  return { code, gapPercent, declaredIncome, verifiedIncome };
}
