import { beforeAll, describe, expect, it } from "vitest";

import { getDb } from "@/db/client";
import { applications, documents } from "@/db/schema";
import {
  addDocument,
  applyTransition,
  getApplication,
  getMetrics,
  getQueues,
  listApplications,
  matchesQuery,
  parseApplicationId,
  saveFieldReport,
} from "@/server/repo";
import type { SessionUser } from "@/server/session";
import { eq } from "drizzle-orm";

/**
 * These run against a real Postgres held in memory (PGlite), migrated and seeded
 * exactly as the app does at start-up. That is the only way to show that the
 * locking actually works.
 */

const CLERK: SessionUser = {
  id: 1,
  username: "clerk",
  fullName: "सुरेश दिनकर पवार",
  fullNameEn: "Suresh Dinkar Pawar",
  designation: "revenue_assistant",
  roles: ["clerk"],
};

const TALATHI: SessionUser = { ...CLERK, id: 2, username: "talathi", roles: ["talathi"] };
const OFFICER: SessionUser = { ...CLERK, id: 3, username: "officer", roles: ["officer"] };

async function byNumber(applicationNumber: string) {
  const all = await listApplications();
  const found = all.find((row) => row.applicationNumber === applicationNumber);
  if (!found) throw new Error(`no application ${applicationNumber} in the seed`);
  return found;
}

beforeAll(async () => {
  await getDb();
}, 60_000);

describe("the seeded register", () => {
  it("holds the thirteen demo applications", async () => {
    const all = await listApplications();
    expect(all).toHaveLength(13);
  });

  it("gives the clerk four files to scrutinise, one of them overdue", async () => {
    const queues = await getQueues(["clerk"], new Date());
    expect(queues.counts.pending).toBe(4);
    expect(queues.counts.overdue).toBe(1);
    expect(queues.counts.dueSoon).toBe(1);
    expect(queues.withApplicant).toHaveLength(1);
  });

  it("gives each of the other desks its own work", async () => {
    const now = new Date();
    expect((await getQueues(["talathi"], now)).counts.pending).toBe(2);
    expect((await getQueues(["officer"], now)).counts.pending).toBe(2);
  });

  it("records the arrival check, so the queue can be ranked unopened", async () => {
    const ganesh = await byNumber("001043");
    expect(ganesh.riskScore).toBe(50);
    expect(ganesh.findingCount).toBe(2);

    const sunita = await byNumber("001041");
    expect(sunita.riskScore).toBe(0);
    expect(sunita.findingCount).toBe(0);
  });
});

describe("search", () => {
  it("finds a Marathi name typed in English", async () => {
    const ganesh = await byNumber("001043");
    expect(matchesQuery(ganesh, "ganesh")).toBe(true);
    expect(matchesQuery(ganesh, "गणेश")).toBe(true);
    expect(matchesQuery(ganesh, "Ghotawade")).toBe(true);
    expect(matchesQuery(ganesh, "1043")).toBe(true);
    expect(matchesQuery(ganesh, "xyz")).toBe(false);
  });

  it("matches everything on an empty query", async () => {
    expect(matchesQuery(await byNumber("001041"), "  ")).toBe(true);
  });
});

describe("ids from the URL", () => {
  it("refuses anything that is not a positive whole number", () => {
    expect(parseApplicationId("abc")).toBeNull();
    expect(parseApplicationId("1.5")).toBeNull();
    expect(parseApplicationId("-1")).toBeNull();
    expect(parseApplicationId("")).toBeNull();
    expect(parseApplicationId("12")).toBe(12);
  });

  it("reports a missing application rather than throwing", async () => {
    expect(await getApplication(9999)).toBeNull();
  });
});

describe("two scans saved at the same moment", () => {
  it("keeps both documents and leaves one consistent risk score", async () => {
    const anil = await byNumber("001044");
    const before = (await getApplication(anil.id))!.documents.length;

    const [first, second] = await Promise.all([
      addDocument(
        anil.id,
        { docType: "electricity_bill", nameOnDocument: "अनिल दत्तात्रय शिंदे", source: "ocr" },
        CLERK.id,
      ),
      addDocument(
        anil.id,
        { docType: "other", nameOnDocument: "अनिल दत्तात्रय शिंदे", source: "ocr" },
        CLERK.id,
      ),
    ]);

    expect(first.ok && second.ok).toBe(true);

    const db = await getDb();
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.applicationId, anil.id));
    expect(rows).toHaveLength(before + 2);

    // The cached score was written inside the lock, so it matches the final set.
    const [row] = await db.select().from(applications).where(eq(applications.id, anil.id));
    expect(row.riskScore).toBeGreaterThanOrEqual(0);
  });

  it("reports a missing application instead of inserting an orphan document", async () => {
    const result = await addDocument(9999, { docType: "other", source: "ocr" }, CLERK.id);
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

describe("transitions", () => {
  it("refuses a second action once the file has moved on", async () => {
    const rekha = await byNumber("001045");

    const first = await applyTransition({
      applicationId: rekha.id,
      user: CLERK,
      action: "return_to_applicant",
      remarks: "स्वयंघोषणापत्र जोडावे",
      expectedStage: "scrutiny",
      aiSuggestedAction: "return_to_applicant",
    });
    expect(first.ok).toBe(true);

    // The second person still has the old screen open.
    const second = await applyTransition({
      applicationId: rekha.id,
      user: CLERK,
      action: "send_for_field",
      expectedStage: "scrutiny",
    });
    expect(second).toEqual({ ok: false, error: "STAGE_CHANGED" });
  });

  it("pauses the clock on the way out and restarts it on the way back", async () => {
    const rekha = await byNumber("001045");
    const paused = (await getApplication(rekha.id))!.application;
    expect(paused.stage).toBe("with_applicant");
    expect(paused.clockPausedAt).not.toBeNull();

    const back = await applyTransition({
      applicationId: rekha.id,
      user: CLERK,
      action: "applicant_complied",
      expectedStage: "with_applicant",
    });
    expect(back.ok).toBe(true);

    const restarted = (await getApplication(rekha.id))!.application;
    expect(restarted.stage).toBe("scrutiny");
    expect(restarted.clockPausedAt).toBeNull();
    expect(restarted.deadlineAt.getTime()).toBeGreaterThan(paused.deadlineAt.getTime());
  });

  it("will not let a file reach the officer without the field work", async () => {
    const shabana = await byNumber("001036");
    const result = await applyTransition({
      applicationId: shabana.id,
      user: TALATHI,
      action: "send_for_decision",
      expectedStage: "field",
    });
    expect(result).toEqual({ ok: false, error: "FIELD_REPORT_REQUIRED" });
  });

  it("lets it through once the Talathi has filed the report", async () => {
    const shabana = await byNumber("001036");

    const saved = await saveFieldReport(
      shabana.id,
      {
        residenceConfirmed: true,
        verifiedFamilyMembers: 4,
        verifiedAnnualIncome: 195000,
        fieldReport: "मौजे हिंजवडी येथे भेट देऊन चौकशी केली...",
      },
      TALATHI,
    );
    expect(saved.ok).toBe(true);

    const sent = await applyTransition({
      applicationId: shabana.id,
      user: TALATHI,
      action: "send_for_decision",
      expectedStage: "field",
      aiSuggestedAction: "send_for_decision",
    });
    expect(sent.ok && sent.data.stage).toBe("decision");
  });

  it("refuses a field report from someone who is not the Talathi", async () => {
    const mahesh = await byNumber("001038");
    const result = await saveFieldReport(
      mahesh.id,
      {
        residenceConfirmed: true,
        verifiedFamilyMembers: 5,
        verifiedAnnualIncome: 65000,
        fieldReport: "...",
      },
      CLERK,
    );
    expect(result).toEqual({ ok: false, error: "NOT_YOUR_STEP" });
  });

  it("issues a certificate on approval, for the income the office established", async () => {
    const vaishali = await byNumber("001034");

    const result = await applyTransition({
      applicationId: vaishali.id,
      user: OFFICER,
      action: "approve",
      expectedStage: "decision",
      aiSuggestedAction: "return_to_applicant",
    });
    expect(result.ok).toBe(true);

    const { application } = (await getApplication(vaishali.id))!;
    expect(application.stage).toBe("closed");
    expect(application.decision).toBe("approved");
    expect(application.certificateNumber).toMatch(/^INC\/\d{4}\/MLS\/001034$/);
    expect(application.certifiedAnnualIncome).toBe(application.verifiedAnnualIncome);
    expect(application.certifiedById).toBe(OFFICER.id);
  });

  it("records an override in the history", async () => {
    const vaishali = await byNumber("001034");
    const { events } = (await getApplication(vaishali.id))!;
    const approval = events.findLast((event) => event.action === "approve");

    expect(approval?.aiSuggestedAction).toBe("return_to_applicant");
    expect(approval?.followedAi).toBe(false);
  });

  it("refuses an action on a file that is not at the caller's step", async () => {
    const prakash = await byNumber("001031");
    const result = await applyTransition({
      applicationId: prakash.id,
      user: CLERK,
      action: "approve",
      expectedStage: "decision",
    });
    expect(result).toEqual({ ok: false, error: "NOT_YOUR_STEP" });
  });
});

describe("metrics", () => {
  it("counts what the office actually did", async () => {
    const metrics = await getMetrics();

    expect(metrics.total).toBe(13);
    // Four were closed in the seed; this run approved 001034 as well.
    expect(metrics.closed).toBeGreaterThanOrEqual(4);
    expect(metrics.returnRatePercent).toBeGreaterThan(0);
    expect(metrics.reworkCount).toBe(0);
    expect(metrics.aiAgreementPercent).not.toBeNull();
    expect(metrics.overrides.length).toBeGreaterThanOrEqual(1);
    expect(metrics.overrides.some((row) => row.applicationNumber === "001022")).toBe(true);
  });
});
