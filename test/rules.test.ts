import { describe, expect, it } from "vitest";

import { assessScrutiny, assessField, buildDecisionBrief } from "@/lib/ai/assistant";
import {
  buildChecklist,
  checkDocuments,
  compareVerifiedIncome,
  incomeGapPercent,
  requirementsFor,
  type ApplicationFacts,
  type DocumentFacts,
} from "@/lib/ai/rules";
import { deadlineState, MS_PER_DAY } from "@/lib/priority";

const BASE: ApplicationFacts = {
  applicantName: "गणेश बाळू पाटील",
  applicantNameEn: "Ganesh Balu Patil",
  village: "घोटावडे",
  villageEn: "Ghotawade",
  occupation: "farmer",
  declaredAnnualIncome: 95000,
  declaredFamilyMembers: 6,
};

const AADHAAR: DocumentFacts = {
  docType: "aadhaar",
  nameOnDocument: "गणेश बाळू पाटील",
};
const RATION: DocumentFacts = {
  docType: "ration_card",
  nameOnDocument: "गणेश बाळू पाटील",
  addressOnDocument: "मु.पो. घोटावडे, ता. मुळशी, जि. पुणे",
};
const DECLARATION: DocumentFacts = {
  docType: "self_declaration",
  nameOnDocument: "गणेश बाळू पाटील",
};

function codes(findings: Array<{ code: string }>): string[] {
  return findings.map((finding) => finding.code);
}

describe("what each occupation has to file", () => {
  it("asks a farmer for a 7/12 extract and a salaried applicant for a slip", () => {
    expect(requirementsFor("farmer").at(-1)).toEqual({
      code: "income_proof",
      accepts: ["land_7_12"],
    });
    expect(requirementsFor("salaried").at(-1)?.accepts).toEqual(["salary_slip"]);
    expect(requirementsFor("business").at(-1)?.accepts).toEqual(["itr"]);
  });

  it("asks a daily-wage applicant for nothing beyond the three basics", () => {
    // There is no paper trail for daily wages, so the field visit is the evidence.
    const requirements = requirementsFor("labour");
    expect(requirements).toHaveLength(3);
    expect(codes(requirements)).toEqual(["identity", "residence", "declaration"]);
  });

  it("counts either a ration card or an electricity bill as proof of residence", () => {
    const withBill = buildChecklist("labour", [
      AADHAAR,
      { docType: "electricity_bill" },
      DECLARATION,
    ]);
    expect(withBill.every((row) => row.present)).toBe(true);
    expect(withBill[1].satisfiedBy).toBe("electricity_bill");
  });
});

describe("income tolerance at the counter", () => {
  it("rounds the gap to whole percent", () => {
    expect(incomeGapPercent(65000, 70000)).toBe(8);
    expect(incomeGapPercent(120000, 264000)).toBe(120);
    expect(incomeGapPercent(0, 5000)).toBe(100);
  });

  it("accepts a document exactly on the 20 per cent line", () => {
    const { findings } = checkDocuments(
      { ...BASE, occupation: "business", declaredAnnualIncome: 100000 },
      [AADHAAR, RATION, DECLARATION, { docType: "itr", annualIncome: 120000 }],
    );
    expect(codes(findings)).not.toContain("income_above_declared");
  });

  it("queries a document one per cent over the line", () => {
    const { findings } = checkDocuments(
      { ...BASE, occupation: "business", declaredAnnualIncome: 100000 },
      [AADHAAR, RATION, DECLARATION, { docType: "itr", annualIncome: 121000 }],
    );
    expect(codes(findings)).toContain("income_above_declared");
  });

  it("does not query an income below the declared one", () => {
    const { findings } = checkDocuments(
      { ...BASE, occupation: "business", declaredAnnualIncome: 100000 },
      [AADHAAR, RATION, DECLARATION, { docType: "itr", annualIncome: 60000 }],
    );
    expect(codes(findings)).not.toContain("income_above_declared");
  });
});

describe("income tolerance after the field visit", () => {
  it("accepts a verified figure exactly on the 25 per cent line", () => {
    expect(compareVerifiedIncome(180000, 225000).code).toBe("field_income_matches");
  });

  it("flags a verified figure one notch over the line", () => {
    const result = compareVerifiedIncome(180000, 226000);
    expect(result.code).toBe("field_income_above_declared");
    expect(result.gapPercent).toBe(26);
  });

  it("flags a verified figure well below the declaration too", () => {
    expect(compareVerifiedIncome(180000, 100000).code).toBe("field_income_below_declared");
  });

  it("treats a small difference as agreement", () => {
    expect(compareVerifiedIncome(65000, 70000).code).toBe("field_income_matches");
  });
});

describe("the checks on a whole file", () => {
  it("finds nothing wrong with a complete labour file", () => {
    const assessment = assessScrutiny(
      {
        ...BASE,
        occupation: "labour",
        applicantName: "सुनीता रमेश जाधव",
        village: "पिरंगुट",
        declaredAnnualIncome: 48000,
      },
      [
        { docType: "aadhaar", nameOnDocument: "सुनीता रमेश जाधव" },
        {
          docType: "ration_card",
          nameOnDocument: "सुनीता रमेश जाधव",
          addressOnDocument: "मु.पो. पिरंगुट, ता. मुळशी, जि. पुणे",
        },
        { docType: "self_declaration", nameOnDocument: "सुनीता रमेश जाधव" },
      ],
    );

    expect(assessment.riskScore).toBe(0);
    expect(codes(assessment.findings)).toEqual(["labour_no_income_proof"]);
    expect(assessment.suggestion.action).toBe("send_for_field");
    expect(assessment.suggestion.confidence).toBe("high");
  });

  it("catches the name on the 7/12 extract and the land income together", () => {
    const assessment = assessScrutiny(BASE, [
      AADHAAR,
      RATION,
      DECLARATION,
      {
        docType: "land_7_12",
        nameOnDocument: "गणपत बाळू पाटील",
        addressOnDocument: "मौजे घोटावडे, ता. मुळशी",
        landAreaCentiHectares: 320,
        irrigated: true,
      },
    ]);

    expect(codes(assessment.findings)).toEqual(["name_mismatch", "land_income_doubt"]);
    expect(assessment.riskScore).toBe(50);
    expect(assessment.suggestion.action).toBe("return_to_applicant");
    // Only the name is something the citizen can fix, so only that goes in the SMS.
    expect(codes(assessment.actionableFindings)).toEqual(["name_mismatch"]);
  });

  it("sends a salary slip gap to the field visit rather than back to the counter", () => {
    const assessment = assessScrutiny(
      { ...BASE, occupation: "salaried", declaredAnnualIncome: 120000 },
      [AADHAAR, RATION, DECLARATION, { docType: "salary_slip", monthlyNetPay: 22000 }],
    );

    expect(codes(assessment.findings)).toEqual(["income_above_declared"]);
    expect(assessment.riskScore).toBe(35);
    expect(assessment.suggestion.action).toBe("send_for_field");
    expect(assessment.actionableFindings).toEqual([]);
  });

  it("returns a file that is missing its self-declaration", () => {
    const assessment = assessScrutiny({ ...BASE, occupation: "labour" }, [AADHAAR, RATION]);

    expect(codes(assessment.findings)).toContain("missing_document");
    expect(assessment.riskScore).toBe(30);
    expect(assessment.suggestion.action).toBe("return_to_applicant");
    expect(assessment.suggestion.confidence).toBe("high");
  });

  it("flags an address in another village", () => {
    const assessment = assessScrutiny({ ...BASE, occupation: "labour" }, [
      AADHAAR,
      {
        docType: "ration_card",
        nameOnDocument: "गणेश बाळू पाटील",
        addressOnDocument: "मु.पो. वडगाव, ता. हवेली, जि. पुणे",
      },
      DECLARATION,
    ]);
    expect(codes(assessment.findings)).toContain("address_outside_village");
  });

  it("does not doubt a small rain-fed holding", () => {
    const assessment = assessScrutiny({ ...BASE, declaredAnnualIncome: 65000 }, [
      AADHAAR,
      RATION,
      DECLARATION,
      { docType: "land_7_12", landAreaCentiHectares: 110, irrigated: false },
    ]);
    expect(codes(assessment.findings)).toEqual([]);
    expect(assessment.riskScore).toBe(0);
  });
});

describe("the visit checklist", () => {
  it("puts the occupation check third and carries findings into the list", () => {
    const field = assessField(
      { ...BASE, occupation: "business", declaredAnnualIncome: 180000 },
      [AADHAAR, { docType: "itr", annualIncome: 300000 }],
      checkDocuments({ ...BASE, occupation: "business", declaredAnnualIncome: 180000 }, [
        AADHAAR,
        { docType: "itr", annualIncome: 300000 },
      ]).findings,
      {},
    );

    expect(field.checklist[0].code).toBe("confirm_residence");
    expect(field.checklist[1].code).toBe("confirm_family_size");
    expect(field.checklist[2].code).toBe("visit_business");
    expect(field.checklist.some((item) => item.code === "ask_about_document_income")).toBe(
      true,
    );
    expect(field.checklist.at(-1)?.code).toBe("record_panch");
  });

  it("asks a farmer to inspect the actual holding", () => {
    const field = assessField(
      BASE,
      [AADHAAR, { docType: "land_7_12", landAreaCentiHectares: 110, irrigated: false }],
      [],
      {},
    );
    expect(field.checklist[2]).toMatchObject({
      code: "inspect_land",
      params: { areaHectares: 1.1 },
    });
  });

  it("notes an unconfirmed residence but still sends the file to the officer", () => {
    const field = assessField(BASE, [AADHAAR], [], {
      residenceConfirmed: false,
      verifiedAnnualIncome: 95000,
    });
    expect(codes(field.notes)).toContain("residence_not_confirmed");
    expect(field.suggestion.action).toBe("send_for_decision");
  });
});

describe("the brief for the officer", () => {
  const now = new Date("2026-11-24T10:00:00+05:30");

  function brief(overrides: Partial<Parameters<typeof buildDecisionBrief>[0]>) {
    const { findings, checklist } = checkDocuments(BASE, [AADHAAR, RATION, DECLARATION, {
      docType: "land_7_12",
      nameOnDocument: "गणेश बाळू पाटील",
      landAreaCentiHectares: 110,
      irrigated: false,
    }]);

    return buildDecisionBrief({
      application: BASE,
      findings,
      checklist,
      residenceConfirmed: true,
      verifiedAnnualIncome: 95000,
      verifiedFamilyMembers: 6,
      fieldReport: "पंचनामा...",
      deadline: deadlineState(new Date(now.getTime() + 5 * MS_PER_DAY), now),
      certificateNumber: "INC/2026/MLS/001043",
      officerName: "अश्विनी कदम",
      decisionDate: "24/11/2026",
      ...overrides,
    });
  }

  it("suggests approval with high confidence when nothing weighs against it", () => {
    const result = brief({});
    expect(result.suggestion.action).toBe("approve");
    expect(result.suggestion.confidence).toBe("high");
    expect(result.orderTemplate).toBe("approve");
    expect(codes(result.pointsFor)).toContain("residence_confirmed");
  });

  it("drops to medium confidence when the file is overdue, and says why", () => {
    const result = brief({
      deadline: deadlineState(new Date(now.getTime() - 2 * MS_PER_DAY), now),
    });
    expect(result.suggestion.action).toBe("approve");
    expect(result.suggestion.confidence).toBe("medium");
    expect(result.pointsAgainst).toContainEqual({ code: "overdue", params: { days: 2 } });
  });

  it("suggests a revised declaration when the verified income is well above the declared", () => {
    // The 001034 case: the visit found the husband's undeclared earnings.
    const result = brief({
      application: { ...BASE, occupation: "salaried", declaredAnnualIncome: 125000 },
      verifiedAnnualIncome: 255000,
    });
    expect(result.suggestion.action).toBe("return_to_applicant");
    expect(result.suggestion.reasonCode).toBe("revised_declaration_needed");
    expect(result.orderTemplate).toBe("return");
    expect(result.orderParams.gapPercent).toBe(104);
  });

  it("suggests rejection when residence was not established", () => {
    const result = brief({ residenceConfirmed: false });
    expect(result.suggestion.action).toBe("reject");
    expect(result.suggestion.confidence).toBe("high");
    expect(result.orderTemplate).toBe("reject");
  });

  it("certifies the income the office established, not the one declared", () => {
    expect(brief({ verifiedAnnualIncome: 125000 }).orderParams.certifiedIncome).toBe(125000);
  });
});

describe("correcting a mis-read document", () => {
  const salaried: ApplicationFacts = {
    ...BASE,
    occupation: "salaried",
    declaredAnnualIncome: 120000,
  };

  it("compares the newest slip on file, so a corrected figure clears the query", () => {
    // The clerk scans the slip, OCR reads 23,800, the clerk corrects it to 9,000
    // and files it. Checking again must drop the query, not keep the old one.
    const withCorrection = assessScrutiny(salaried, [
      AADHAAR,
      RATION,
      DECLARATION,
      { docType: "salary_slip", monthlyNetPay: 22000 },
      { docType: "salary_slip", monthlyNetPay: 9000 },
    ]);

    expect(codes(withCorrection.findings)).toEqual([]);
    expect(withCorrection.riskScore).toBe(0);
  });

  it("still queries it when the newer slip is the one above the declaration", () => {
    const worse = assessScrutiny(salaried, [
      AADHAAR,
      RATION,
      DECLARATION,
      { docType: "salary_slip", monthlyNetPay: 9000 },
      { docType: "salary_slip", monthlyNetPay: 22000 },
    ]);
    expect(codes(worse.findings)).toEqual(["income_above_declared"]);
  });

  it("checks the name on every document, old ones included", () => {
    // A wrong name on any paper in the file matters, however many follow it.
    const assessment = assessScrutiny(salaried, [
      AADHAAR,
      RATION,
      DECLARATION,
      { docType: "salary_slip", nameOnDocument: "गणपत बाळू पाटील", monthlyNetPay: 9000 },
      { docType: "salary_slip", nameOnDocument: "गणेश बाळू पाटील", monthlyNetPay: 9000 },
    ]);
    expect(codes(assessment.findings)).toContain("name_mismatch");
  });
});
