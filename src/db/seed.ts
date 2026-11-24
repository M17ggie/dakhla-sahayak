import "server-only";

import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

import type { Database } from "./client";
import { applications, documents, events, users } from "./schema";
import type { DocType, Occupation, Purpose, Role, Stage } from "./schema";
import { assessScrutiny, countableFindings } from "@/lib/ai/assistant";
import { deadlineFromSubmission, MS_PER_DAY } from "@/lib/priority";
import { certificateNumberFor } from "@/lib/certificate";

import userFixtures from "./fixtures/users.json";
import applicationFixtures from "./fixtures/applications.json";
import narratives from "./fixtures/narratives.json";

/**
 * Demo data.
 *
 * Dates are relative to the moment the database is created, so deadlines always
 * look current: a reviewer opening the app next month still sees one overdue
 * file and one due in two days.
 */

type HistoryFixture = {
  action: string;
  role?: string;
  dayOffset: number;
  remarksKey?: string;
  aiSuggestedAction?: string;
};

type DocumentFixture = {
  docType: string;
  nameOnDocument?: string;
  addressOnDocument?: string;
  monthlyNetPay?: number;
  annualIncome?: number;
  landAreaCentiHectares?: number;
  irrigated?: boolean;
  source: string;
};

type ApplicationFixture = {
  applicationNumber: string;
  applicantName: string;
  applicantNameEn: string;
  aadhaarLast4: string;
  mobile: string;
  village: string;
  villageEn: string;
  occupation: string;
  purpose: string;
  declaredAnnualIncome: number;
  declaredFamilyMembers: number;
  submittedDaysAgo: number;
  stage: string;
  pausedDaysAgo?: number;
  documents: DocumentFixture[];
  field?: {
    dayOffset: number;
    residenceConfirmed: boolean;
    verifiedFamilyMembers: number;
    verifiedAnnualIncome: number;
    reportKey: string;
  };
  decision?: {
    outcome: "approved" | "rejected";
    dayOffset: number;
    certifiedAnnualIncome?: number;
    remarksKey?: string;
    aiSuggestedAction?: string;
  };
  history: HistoryFixture[];
};

const fieldReports = narratives.fieldReports as Record<string, string>;
const remarksText = narratives.remarks as Record<string, string>;

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * MS_PER_DAY);
}

/**
 * Seeds the demo data if the database is empty.
 *
 * Two cold starts can hit an empty database at the same moment, so the whole
 * check-and-insert runs inside a transaction holding an advisory lock: the
 * second one waits, then finds the rows already there and does nothing.
 */
export async function seedIfEmpty(db: Database, lockKey: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${lockKey})`);

    const existing = await tx.select({ id: users.id }).from(users).limit(1);
    if (existing.length > 0) return;

    const now = new Date();

    const insertedUsers = await tx
      .insert(users)
      .values(
        (userFixtures as Array<(typeof userFixtures)[number]>).map((user) => ({
          username: user.username,
          passwordHash: bcrypt.hashSync(user.password, 10),
          fullName: user.fullName,
          fullNameEn: user.fullNameEn,
          designation: user.designation,
          roles: user.roles as Role[],
        })),
      )
      .returning({ id: users.id, username: users.username, fullName: users.fullName });

    const userByRole: Record<string, { id: number; fullName: string }> = {
      clerk: insertedUsers.find((u) => u.username === "clerk")!,
      talathi: insertedUsers.find((u) => u.username === "talathi")!,
      officer: insertedUsers.find((u) => u.username === "officer")!,
    };

    for (const fixture of applicationFixtures as ApplicationFixture[]) {
      const submittedAt = daysAgo(now, fixture.submittedDaysAgo);
      const stage = fixture.stage as Stage;

      const decision = fixture.decision;
      const field = fixture.field;

      const decidedAt = decision
        ? new Date(submittedAt.getTime() + decision.dayOffset * MS_PER_DAY)
        : null;

      const [row] = await tx
        .insert(applications)
        .values({
          applicationNumber: fixture.applicationNumber,
          applicantName: fixture.applicantName,
          applicantNameEn: fixture.applicantNameEn,
          aadhaarLast4: fixture.aadhaarLast4,
          mobile: fixture.mobile,
          village: fixture.village,
          villageEn: fixture.villageEn,
          taluka: "मुळशी",
          district: "पुणे",
          occupation: fixture.occupation as Occupation,
          purpose: fixture.purpose as Purpose,
          declaredAnnualIncome: fixture.declaredAnnualIncome,
          declaredFamilyMembers: fixture.declaredFamilyMembers,
          submittedAt,
          deadlineAt: deadlineFromSubmission(submittedAt),
          clockPausedAt:
            fixture.pausedDaysAgo !== undefined ? daysAgo(now, fixture.pausedDaysAgo) : null,
          stage,
          fieldReport: field ? fieldReports[field.reportKey] : null,
          verifiedAnnualIncome: field?.verifiedAnnualIncome ?? null,
          verifiedFamilyMembers: field?.verifiedFamilyMembers ?? null,
          residenceConfirmed: field?.residenceConfirmed ?? null,
          fieldVisitAt: field
            ? new Date(submittedAt.getTime() + field.dayOffset * MS_PER_DAY)
            : null,
          decision: decision?.outcome ?? null,
          decidedAt,
          certificateNumber:
            decision?.outcome === "approved" && decidedAt
              ? certificateNumberFor(fixture.applicationNumber, decidedAt)
              : null,
          certifiedAnnualIncome:
            decision?.outcome === "approved" ? (decision.certifiedAnnualIncome ?? null) : null,
          certifiedById: decision?.outcome === "approved" ? userByRole.officer.id : null,
        })
        .returning({ id: applications.id });

      const docRows = fixture.documents.map((doc) => ({
        applicationId: row.id,
        docType: doc.docType as DocType,
        nameOnDocument: doc.nameOnDocument ?? null,
        addressOnDocument: doc.addressOnDocument ?? null,
        monthlyNetPay: doc.monthlyNetPay ?? null,
        annualIncome: doc.annualIncome ?? null,
        landAreaCentiHectares: doc.landAreaCentiHectares ?? null,
        irrigated: doc.irrigated ?? null,
        source: doc.source as "setu" | "ocr" | "manual",
        addedAt: submittedAt,
      }));
      if (docRows.length) await tx.insert(documents).values(docRows);

      // The arrival check, so the dashboard can rank before anyone opens the file.
      const assessment = assessScrutiny(
        {
          applicantName: fixture.applicantName,
          applicantNameEn: fixture.applicantNameEn,
          village: fixture.village,
          villageEn: fixture.villageEn,
          occupation: fixture.occupation as Occupation,
          declaredAnnualIncome: fixture.declaredAnnualIncome,
          declaredFamilyMembers: fixture.declaredFamilyMembers,
        },
        docRows,
      );

      await tx
        .update(applications)
        .set({
          riskScore: assessment.riskScore,
          findingCount: countableFindings(assessment.findings),
        })
        .where(sql`${applications.id} = ${row.id}`);

      const eventRows: Array<typeof events.$inferInsert> = fixture.history.map((entry) => ({
        applicationId: row.id,
        type: entry.action === "submitted" ? "submitted" : "transition",
        action: entry.action,
        actorId: entry.role ? userByRole[entry.role].id : null,
        actorRole: (entry.role as Role | undefined) ?? null,
        remarks: entry.remarksKey ? remarksText[entry.remarksKey] : null,
        aiSuggestedAction: entry.aiSuggestedAction ?? null,
        followedAi: entry.aiSuggestedAction
          ? entry.aiSuggestedAction === entry.action
          : null,
        createdAt: new Date(submittedAt.getTime() + entry.dayOffset * MS_PER_DAY),
      }));

      // The automatic arrival check sits right after submission in the timeline.
      eventRows.splice(1, 0, {
        applicationId: row.id,
        type: "ai_run",
        action: "scrutiny",
        aiSuggestedAction: assessment.suggestion.action,
        aiRiskScore: assessment.riskScore,
        createdAt: new Date(submittedAt.getTime() + 60_000),
      });

      await tx.insert(events).values(eventRows);
    }
  });
}
