import "server-only";

import { desc, eq } from "drizzle-orm";

import { getDb, type Database } from "@/db/client";
import {
  applications,
  documents,
  events,
  users,
  type Application,
  type DocType,
  type Document,
  type Event,
  type Role,
  type Stage,
} from "@/db/schema";
import { assessScrutiny, countableFindings } from "@/lib/ai/assistant";
import type { ApplicationFacts, DocumentFacts } from "@/lib/ai/rules";
import { certificateNumberFor } from "@/lib/certificate";
import { deadlineState, MS_PER_DAY } from "@/lib/priority";
import {
  SLA_DAYS,
  stagesOwnedBy,
  validateTransition,
  type Action,
  type ValidationError,
} from "@/lib/workflow";
import { compareNames, tokenize } from "@/lib/ai/name-match";
import type { SessionUser } from "./session";

/**
 * All data access. Every state change happens inside a transaction that locks
 * the application row first, so two people acting on the same file at the same
 * moment cannot overwrite each other.
 */

export type RepoError = ValidationError | "NOT_FOUND" | "INVALID_INPUT";
export type RepoResult<T> = { ok: true; data: T } | { ok: false; error: RepoError };

/** Application ids come from the URL, so they are not trusted to be numbers. */
export function parseApplicationId(value: string | number): number | null {
  const id = typeof value === "number" ? value : Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function factsOf(application: Application): ApplicationFacts {
  return {
    applicantName: application.applicantName,
    applicantNameEn: application.applicantNameEn,
    village: application.village,
    villageEn: application.villageEn,
    occupation: application.occupation,
    declaredAnnualIncome: application.declaredAnnualIncome,
    declaredFamilyMembers: application.declaredFamilyMembers,
  };
}

export function docFactsOf(document: Document): DocumentFacts {
  return {
    docType: document.docType,
    nameOnDocument: document.nameOnDocument,
    addressOnDocument: document.addressOnDocument,
    monthlyNetPay: document.monthlyNetPay,
    annualIncome: document.annualIncome,
    landAreaCentiHectares: document.landAreaCentiHectares,
    irrigated: document.irrigated,
  };
}

/* ------------------------------------------------------------------- users */

export async function findUserByUsername(username: string) {
  const db = await getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username.trim().toLowerCase()))
    .limit(1);
  return user ?? null;
}

async function userById(db: Database, id: number) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

/* ------------------------------------------------------------ applications */

export type ApplicationSummary = Application;

export async function listApplications(): Promise<ApplicationSummary[]> {
  const db = await getDb();
  return db.select().from(applications).orderBy(desc(applications.submittedAt));
}

export type ApplicationDetail = {
  application: Application;
  documents: Document[];
  events: Array<Event & { actorName: string | null }>;
  certifiedBy: { fullName: string; fullNameEn: string } | null;
};

export async function getApplication(id: number): Promise<ApplicationDetail | null> {
  const db = await getDb();

  const [application] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, id))
    .limit(1);
  if (!application) return null;

  const [docs, history] = await Promise.all([
    db
      .select()
      .from(documents)
      .where(eq(documents.applicationId, id))
      .orderBy(documents.addedAt, documents.id),
    db
      .select({
        event: events,
        actorName: users.fullName,
        actorNameEn: users.fullNameEn,
      })
      .from(events)
      .leftJoin(users, eq(events.actorId, users.id))
      .where(eq(events.applicationId, id))
      .orderBy(events.createdAt, events.id),
  ]);

  const certifiedBy = application.certifiedById
    ? await userById(db, application.certifiedById)
    : null;

  return {
    application,
    documents: docs,
    events: history.map((row) => ({ ...row.event, actorName: row.actorName })),
    certifiedBy: certifiedBy
      ? { fullName: certifiedBy.fullName, fullNameEn: certifiedBy.fullNameEn }
      : null,
  };
}

/* ------------------------------------------------------------------ search */

/**
 * Search in either script.
 *
 * The office handles tens of files a week, so the whole set is filtered in
 * memory: that lets `ganesh` find गणेश through the same transliteration the
 * name checks use. A taluka with a far larger register would want a generated
 * column holding the phonetic key instead.
 */
export function matchesQuery(application: Application, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;

  const haystack = [
    application.applicationNumber,
    application.applicantName,
    application.applicantNameEn,
    application.village,
    application.villageEn,
    application.mobile,
  ];

  const lowered = trimmed.toLowerCase();
  if (haystack.some((value) => value.toLowerCase().includes(lowered))) return true;

  // Fall back to comparing the query against each field across scripts.
  const queryTokens = tokenize(trimmed);
  if (!queryTokens.length) return false;

  return haystack.some((value) => {
    const valueTokens = tokenize(value);
    return queryTokens.every((queryToken) =>
      valueTokens.some(
        (valueToken) =>
          valueToken.key.startsWith(queryToken.key) ||
          compareNames(queryToken.original, valueToken.original).verdict !== "mismatch",
      ),
    );
  });
}

/* ---------------------------------------------------------------- the desk */

export type Queues = {
  mine: Application[];
  withApplicant: Application[];
  closed: Application[];
  all: Application[];
  counts: {
    pending: number;
    overdue: number;
    dueSoon: number;
    closedThisWeek: number;
  };
};

export async function getQueues(roles: readonly Role[], now: Date): Promise<Queues> {
  const all = await listApplications();
  const owned = stagesOwnedBy(roles);

  // `with_applicant` belongs to the clerk, but the citizen holds the file, so it
  // is shown in its own tab rather than counted as pending work.
  const mine = all.filter(
    (row) => owned.includes(row.stage) && row.stage !== "with_applicant",
  );
  const withApplicant = all.filter(
    (row) => row.stage === "with_applicant" && owned.includes(row.stage),
  );
  const closed = all.filter((row) => row.stage === "closed");

  const states = mine.map((row) =>
    deadlineState(row.deadlineAt, now, { paused: Boolean(row.clockPausedAt) }),
  );

  return {
    mine,
    withApplicant,
    closed,
    all,
    counts: {
      pending: mine.length,
      overdue: states.filter((state) => state.status === "overdue").length,
      dueSoon: states.filter(
        (state) => state.status === "urgent" || state.status === "due_soon",
      ).length,
      closedThisWeek: closed.filter(
        (row) => row.decidedAt && now.getTime() - row.decidedAt.getTime() <= 7 * MS_PER_DAY,
      ).length,
    },
  };
}

/* --------------------------------------------------------------- documents */

export type NewDocument = {
  docType: DocType;
  nameOnDocument?: string | null;
  addressOnDocument?: string | null;
  monthlyNetPay?: number | null;
  annualIncome?: number | null;
  landAreaCentiHectares?: number | null;
  irrigated?: boolean | null;
  source: "setu" | "ocr" | "manual";
  rawText?: string | null;
};

/**
 * Adds a document and refreshes the cached risk score.
 *
 * Two scans saved at the same instant would otherwise both read the old
 * document list and write the score computed without the other's document, so
 * the row is locked for the whole read-compute-write.
 */
export async function addDocument(
  applicationId: number,
  input: NewDocument,
  actorId: number,
): Promise<RepoResult<{ documentId: number; riskScore: number }>> {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const [application] = await tx
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .for("update")
      .limit(1);
    if (!application) return { ok: false, error: "NOT_FOUND" as const };

    const [inserted] = await tx
      .insert(documents)
      .values({
        applicationId,
        docType: input.docType,
        nameOnDocument: input.nameOnDocument ?? null,
        addressOnDocument: input.addressOnDocument ?? null,
        monthlyNetPay: input.monthlyNetPay ?? null,
        annualIncome: input.annualIncome ?? null,
        landAreaCentiHectares: input.landAreaCentiHectares ?? null,
        irrigated: input.irrigated ?? null,
        source: input.source,
        rawText: input.rawText ?? null,
        addedById: actorId,
      })
      .returning({ id: documents.id });

    const docs = await tx
      .select()
      .from(documents)
      .where(eq(documents.applicationId, applicationId));

    const assessment = assessScrutiny(factsOf(application), docs.map(docFactsOf));

    await tx
      .update(applications)
      .set({
        riskScore: assessment.riskScore,
        findingCount: countableFindings(assessment.findings),
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));

    return {
      ok: true as const,
      data: { documentId: inserted.id, riskScore: assessment.riskScore },
    };
  });
}

/* ----------------------------------------------------------------- AI runs */

export async function recordAiRun(
  applicationId: number,
  step: "scrutiny" | "field" | "decision",
  riskScore: number,
  findingCount: number,
  suggestedAction: Action | null,
): Promise<void> {
  const db = await getDb();

  await db.transaction(async (tx) => {
    await tx.insert(events).values({
      applicationId,
      type: "ai_run",
      action: step,
      aiSuggestedAction: suggestedAction,
      aiRiskScore: riskScore,
    });

    if (step === "scrutiny") {
      await tx
        .update(applications)
        .set({ riskScore, findingCount, updatedAt: new Date() })
        .where(eq(applications.id, applicationId));
    }
  });
}

/* ------------------------------------------------------------ field report */

export type FieldReportInput = {
  residenceConfirmed: boolean;
  verifiedFamilyMembers: number;
  verifiedAnnualIncome: number;
  fieldReport: string;
};

export async function saveFieldReport(
  applicationId: number,
  input: FieldReportInput,
  user: SessionUser,
): Promise<RepoResult<Application>> {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const [application] = await tx
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .for("update")
      .limit(1);
    if (!application) return { ok: false, error: "NOT_FOUND" as const };

    if (application.stage !== "field") return { ok: false, error: "NOT_YOUR_STEP" as const };
    if (!user.roles.includes("talathi")) return { ok: false, error: "NOT_YOUR_STEP" as const };

    const [updated] = await tx
      .update(applications)
      .set({
        residenceConfirmed: input.residenceConfirmed,
        verifiedFamilyMembers: input.verifiedFamilyMembers,
        verifiedAnnualIncome: input.verifiedAnnualIncome,
        fieldReport: input.fieldReport,
        fieldVisitAt: application.fieldVisitAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId))
      .returning();

    return { ok: true as const, data: updated };
  });
}

/* ------------------------------------------------------------- transitions */

export type TransitionRequest = {
  applicationId: number;
  user: SessionUser;
  action: Action;
  remarks?: string | null;
  expectedStage?: Stage | null;
  /** The suggestion that was on screen, so an override is visible later. */
  aiSuggestedAction?: Action | null;
};

export async function applyTransition(
  request: TransitionRequest,
): Promise<RepoResult<{ stage: Stage; certificateNumber: string | null }>> {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const [application] = await tx
      .select()
      .from(applications)
      .where(eq(applications.id, request.applicationId))
      .for("update")
      .limit(1);
    if (!application) return { ok: false, error: "NOT_FOUND" as const };

    const validation = validateTransition({
      stage: application.stage,
      roles: request.user.roles,
      action: request.action,
      remarks: request.remarks,
      fieldReport: application.fieldReport,
      verifiedAnnualIncome: application.verifiedAnnualIncome,
      expectedStage: request.expectedStage ?? null,
    });
    if (!validation.ok) return { ok: false, error: validation.error };

    const { spec } = validation;
    const now = new Date();

    const patch: Partial<typeof applications.$inferInsert> = {
      stage: spec.to,
      updatedAt: now,
    };

    if (spec.pausesClock) patch.clockPausedAt = now;
    if (spec.restartsClock) {
      patch.clockPausedAt = null;
      // The file comes back as fresh work, so the service clock starts again.
      patch.deadlineAt = new Date(now.getTime() + SLA_DAYS * MS_PER_DAY);
    }

    let certificateNumber: string | null = null;

    if (request.action === "approve" || request.action === "reject") {
      patch.decision = request.action === "approve" ? "approved" : "rejected";
      patch.decidedAt = now;

      if (request.action === "approve") {
        certificateNumber = certificateNumberFor(application.applicationNumber, now);
        patch.certificateNumber = certificateNumber;
        // The certificate carries the income the office established, which is the
        // verified figure where there is one.
        patch.certifiedAnnualIncome =
          application.verifiedAnnualIncome ?? application.declaredAnnualIncome;
        patch.certifiedById = request.user.id;
      }
    }

    await tx
      .update(applications)
      .set(patch)
      .where(eq(applications.id, request.applicationId));

    const suggested = request.aiSuggestedAction ?? null;

    await tx.insert(events).values({
      applicationId: request.applicationId,
      type: "transition",
      action: request.action,
      actorId: request.user.id,
      actorRole: spec.role,
      fromStage: application.stage,
      toStage: spec.to,
      remarks: request.remarks?.trim() || null,
      aiSuggestedAction: suggested,
      followedAi: suggested ? suggested === request.action : null,
      createdAt: now,
    });

    return { ok: true as const, data: { stage: spec.to, certificateNumber } };
  });
}

/* ---------------------------------------------------------------- metrics */

export type Metrics = {
  total: number;
  closed: number;
  averageDaysToDecision: number | null;
  withinSlaPercent: number | null;
  returnRatePercent: number;
  returnsByStage: Array<{ stage: Stage; count: number }>;
  reworkCount: number;
  aiAgreementPercent: number | null;
  aiDecisionCount: number;
  overrides: Array<{
    applicationNumber: string;
    applicationId: number;
    action: string;
    suggested: string;
  }>;
};

export async function getMetrics(): Promise<Metrics> {
  const db = await getDb();

  const [rows, transitions] = await Promise.all([
    db.select().from(applications),
    db
      .select({
        applicationId: events.applicationId,
        action: events.action,
        fromStage: events.fromStage,
        aiSuggestedAction: events.aiSuggestedAction,
        followedAi: events.followedAi,
      })
      .from(events)
      .where(eq(events.type, "transition")),
  ]);

  const numbers = new Map(rows.map((row) => [row.id, row.applicationNumber]));
  const decided = rows.filter((row) => row.decidedAt !== null);

  const daysToDecision = decided.map(
    (row) => (row.decidedAt!.getTime() - row.submittedAt.getTime()) / MS_PER_DAY,
  );

  const returnedIds = new Set(
    transitions
      .filter((event) => event.action === "return_to_applicant")
      .map((event) => event.applicationId),
  );

  const returnsByStage = new Map<Stage, number>();
  for (const event of transitions) {
    if (event.action !== "return_to_applicant" || !event.fromStage) continue;
    returnsByStage.set(event.fromStage, (returnsByStage.get(event.fromStage) ?? 0) + 1);
  }

  const reworkCount = transitions.filter(
    (event) =>
      event.action === "send_back_to_scrutiny" || event.action === "send_for_reverification",
  ).length;

  const withSuggestion = transitions.filter((event) => event.aiSuggestedAction !== null);
  const agreed = withSuggestion.filter((event) => event.followedAi === true);

  return {
    total: rows.length,
    closed: decided.length,
    averageDaysToDecision: daysToDecision.length
      ? Math.round((daysToDecision.reduce((a, b) => a + b, 0) / daysToDecision.length) * 10) /
        10
      : null,
    withinSlaPercent: decided.length
      ? Math.round(
          (decided.filter((row) => row.decidedAt!.getTime() <= row.deadlineAt.getTime()).length /
            decided.length) *
            100,
        )
      : null,
    returnRatePercent: rows.length
      ? Math.round((returnedIds.size / rows.length) * 100)
      : 0,
    returnsByStage: [...returnsByStage.entries()].map(([stage, count]) => ({ stage, count })),
    reworkCount,
    aiAgreementPercent: withSuggestion.length
      ? Math.round((agreed.length / withSuggestion.length) * 100)
      : null,
    aiDecisionCount: withSuggestion.length,
    overrides: withSuggestion
      .filter((event) => event.followedAi === false)
      .map((event) => ({
        applicationId: event.applicationId,
        applicationNumber: numbers.get(event.applicationId) ?? String(event.applicationId),
        action: event.action,
        suggested: event.aiSuggestedAction!,
      })),
  };
}
