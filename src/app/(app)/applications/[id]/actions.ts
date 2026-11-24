"use server";

import { revalidatePath } from "next/cache";

import { DOC_TYPES, STAGES, type DocType, type Stage } from "@/db/schema";
import { assessScrutiny, countableFindings } from "@/lib/ai/assistant";
import { parseFormAmount, parseFormCount, parseFormNumber } from "@/lib/parse";
import { ACTIONS, type Action } from "@/lib/workflow";
import {
  addDocument,
  applyTransition,
  docFactsOf,
  factsOf,
  getApplication,
  parseApplicationId,
  recordAiRun,
  saveFieldReport,
  type RepoError,
} from "@/server/repo";
import { getCurrentUser } from "@/server/session";

export type ActionState = { error?: RepoError | "NOT_AUTHENTICATED"; ok?: boolean };

function refresh(id: number) {
  revalidatePath(`/applications/${id}`);
  revalidatePath("/");
  revalidatePath("/metrics");
}

function parseAction(value: FormDataEntryValue | null): Action | null {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value)
    ? (value as Action)
    : null;
}

function parseStage(value: FormDataEntryValue | null): Stage | null {
  return typeof value === "string" && (STAGES as readonly string[]).includes(value)
    ? (value as Stage)
    : null;
}

function parseDocType(value: FormDataEntryValue | null): DocType | null {
  return typeof value === "string" && (DOC_TYPES as readonly string[]).includes(value)
    ? (value as DocType)
    : null;
}

/* ------------------------------------------------------------------ AI run */

/** Re-checks the documents and records the run in the history. */
export async function runAi(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const id = parseApplicationId(String(formData.get("applicationId") ?? ""));
  if (id === null) return;

  const detail = await getApplication(id);
  if (!detail) return;

  const assessment = assessScrutiny(
    factsOf(detail.application),
    detail.documents.map(docFactsOf),
  );

  await recordAiRun(
    id,
    "scrutiny",
    assessment.riskScore,
    countableFindings(assessment.findings),
    assessment.suggestion.action,
  );

  refresh(id);
}

/* ---------------------------------------------------------------- scanning */

export async function saveScannedDocument(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "NOT_AUTHENTICATED" };

  const id = parseApplicationId(String(formData.get("applicationId") ?? ""));
  if (id === null) return { error: "NOT_FOUND" };

  const docType = parseDocType(formData.get("docType"));
  if (!docType) return { error: "INVALID_INPUT" };

  const name = String(formData.get("nameOnDocument") ?? "").trim();
  const address = String(formData.get("addressOnDocument") ?? "").trim();
  const rawText = String(formData.get("rawText") ?? "").trim();
  const hectares = parseFormNumber(formData.get("landAreaHectares"));

  const result = await addDocument(
    id,
    {
      docType,
      nameOnDocument: name || null,
      addressOnDocument: address || null,
      monthlyNetPay: parseFormAmount(formData.get("monthlyNetPay")),
      annualIncome: parseFormAmount(formData.get("annualIncome")),
      landAreaCentiHectares: hectares === null ? null : Math.round(hectares * 100),
      irrigated: formData.get("irrigated") === "on" ? true : docType === "land_7_12" ? false : null,
      source: "ocr",
      rawText: rawText || null,
    },
    user.id,
  );

  if (!result.ok) return { error: result.error };

  refresh(id);
  return { ok: true };
}

/* ----------------------------------------------------------- field report */

export async function saveFieldReportAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "NOT_AUTHENTICATED" };

  const id = parseApplicationId(String(formData.get("applicationId") ?? ""));
  if (id === null) return { error: "NOT_FOUND" };

  const verifiedAnnualIncome = parseFormAmount(formData.get("verifiedAnnualIncome"));
  const verifiedFamilyMembers = parseFormCount(formData.get("verifiedFamilyMembers"));
  const fieldReport = String(formData.get("fieldReport") ?? "").trim();

  // A blank income or family count is not a zero; the Talathi has to fill them in.
  if (verifiedAnnualIncome === null || verifiedFamilyMembers === null || !fieldReport) {
    return { error: "FIELD_REPORT_REQUIRED" };
  }

  const result = await saveFieldReport(
    id,
    {
      residenceConfirmed: formData.get("residenceConfirmed") === "on",
      verifiedAnnualIncome,
      verifiedFamilyMembers,
      fieldReport,
    },
    user,
  );

  if (!result.ok) return { error: result.error };

  refresh(id);
  return { ok: true };
}

/* ------------------------------------------------------------- transitions */

export async function performAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "NOT_AUTHENTICATED" };

  const id = parseApplicationId(String(formData.get("applicationId") ?? ""));
  if (id === null) return { error: "NOT_FOUND" };

  const action = parseAction(formData.get("action"));
  if (!action) return { error: "INVALID_ACTION" };

  const result = await applyTransition({
    applicationId: id,
    user,
    action,
    remarks: String(formData.get("remarks") ?? ""),
    expectedStage: parseStage(formData.get("expectedStage")),
    aiSuggestedAction: parseAction(formData.get("aiSuggestion")),
  });

  if (!result.ok) return { error: result.error };

  refresh(id);
  return { ok: true };
}
