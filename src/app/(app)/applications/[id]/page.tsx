import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ActionPanel } from "@/components/application/action-panel";
import { DecisionPanel } from "@/components/application/decision-panel";
import { DetailsGrid } from "@/components/application/details-grid";
import { DocumentsPanel } from "@/components/application/documents-panel";
import { FieldPanel } from "@/components/application/field-panel";
import { HistoryPanel } from "@/components/application/history-panel";
import { ScrutinyPanel } from "@/components/application/scrutiny-panel";
import { orderDraft, smsDraft } from "@/components/application/drafts";
import { DeadlineChip } from "@/components/deadline-chip";
import type { Stage } from "@/db/schema";
import { formatDate, formatDateNumeric } from "@/i18n/format";
import { resolveLocale } from "@/i18n/request";
import {
  assessField,
  assessScrutiny,
  buildDecisionBrief,
  type Suggestion,
} from "@/lib/ai/assistant";
import { certificateNumberFor } from "@/lib/certificate";
import { deadlineState } from "@/lib/priority";
import { allowedActions, STAGE_OWNER, stepNumber } from "@/lib/workflow";
import { docFactsOf, factsOf, getApplication, parseApplicationId } from "@/server/repo";
import { getCurrentUser } from "@/server/session";

const STEPS: Array<{ step: 1 | 2 | 3; stage: Stage }> = [
  { step: 1, stage: "scrutiny" },
  { step: 2, stage: "field" },
  { step: 3, stage: "decision" },
];

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = (await getCurrentUser())!;
  const { id: rawId } = await params;

  // `/applications/abc` must be a 404, not a crash.
  const id = parseApplicationId(rawId);
  if (id === null) notFound();

  const detail = await getApplication(id);
  if (!detail) notFound();

  const { application, documents, events, certifiedBy } = detail;
  const t = await getTranslations();
  const locale = await resolveLocale();
  const now = new Date();

  const facts = factsOf(application);
  const docFacts = documents.map(docFactsOf);
  const scrutiny = assessScrutiny(facts, docFacts);

  const options = allowedActions(application.stage, user.roles);
  const canAct = options.length > 0;
  const owner = STAGE_OWNER[application.stage];

  const deadline = deadlineState(application.deadlineAt, now, {
    paused: Boolean(application.clockPausedAt),
  });

  let suggestion: Suggestion | null = null;
  let draft: string | null = null;
  let panel: React.ReactNode = null;

  if (application.stage === "scrutiny" || application.stage === "with_applicant") {
    suggestion = scrutiny.suggestion;
    draft = smsDraft(application.applicationNumber, scrutiny.findings, t);
    panel = (
      <ScrutinyPanel
        application={application}
        assessment={scrutiny}
        lastRun={events.filter((event) => event.type === "ai_run").at(-1) ?? null}
        canAct={canAct}
      />
    );
  } else if (application.stage === "field") {
    const field = assessField(facts, docFacts, scrutiny.findings, {
      residenceConfirmed: application.residenceConfirmed ?? undefined,
      verifiedAnnualIncome: application.verifiedAnnualIncome ?? undefined,
    });
    suggestion = field.suggestion;
    panel = (
      <FieldPanel
        application={application}
        assessment={field}
        canAct={canAct}
        talathiName={user.fullName}
      />
    );
  } else {
    const brief = buildDecisionBrief({
      application: facts,
      findings: scrutiny.findings,
      checklist: scrutiny.checklist,
      residenceConfirmed: application.residenceConfirmed,
      verifiedAnnualIncome: application.verifiedAnnualIncome,
      verifiedFamilyMembers: application.verifiedFamilyMembers,
      fieldReport: application.fieldReport,
      deadline,
      certificateNumber:
        application.certificateNumber ??
        certificateNumberFor(application.applicationNumber, now),
      officerName: certifiedBy?.fullName ?? user.fullName,
      decisionDate: formatDateNumeric(application.decidedAt ?? now),
    });
    suggestion = brief.suggestion;
    draft = orderDraft(brief, t);
    panel = <DecisionPanel application={application} brief={brief} canAct={canAct} />;
  }

  const currentStep = stepNumber(application.stage);

  return (
    <div className="space-y-6">
      <Link href="/" className="no-print inline-block text-sm font-semibold">
        ← {t("application.backToDashboard")}
      </Link>

      <header className="space-y-2">
        <p className="text-sm font-semibold text-[var(--color-ink-soft)]">
          {t("application.title", { number: application.applicationNumber })}
        </p>
        <h1 className="text-2xl font-bold">
          {locale === "en" ? application.applicantNameEn : application.applicantName}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
            {t("step.ofThree", { number: currentStep })} · {t(`stage.${application.stage}`)}
          </span>
          <DeadlineChip
            deadlineAt={application.deadlineAt}
            paused={Boolean(application.clockPausedAt)}
            now={now}
          />
          <span className="text-sm text-[var(--color-ink-soft)]">
            {t("deadline.dueOn", { date: formatDate(application.deadlineAt, locale) })}
          </span>
          {application.decision === "approved" ? (
            <Link href={`/applications/${application.id}/certificate`} className="btn btn-quiet px-3 py-1.5 text-sm">
              {t("certificate.view")}
            </Link>
          ) : null}
        </div>
      </header>

      <ol className="flex flex-wrap gap-2" aria-label={t("application.details")}>
        {STEPS.map(({ step, stage }) => (
          <li
            key={step}
            aria-current={step === currentStep ? "step" : undefined}
            className={`chip border px-3 py-1.5 ${
              step === currentStep
                ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white"
                : step < currentStep
                  ? "border-[var(--color-ok)] bg-[var(--color-ok-soft)] text-[var(--color-ok)]"
                  : "border-[var(--color-line)] bg-[var(--color-card)] text-[var(--color-ink-soft)]"
            }`}
          >
            {t("step.label", { number: step })} · {t(`stage.${stage}`)}
          </li>
        ))}
      </ol>

      {application.stage === "closed" && application.decision && application.decidedAt ? (
        <p
          className={`rounded-lg px-3 py-2 font-semibold ${
            application.decision === "approved"
              ? "bg-[var(--color-ok-soft)] text-[var(--color-ok)]"
              : "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
          }`}
        >
          {t("application.closedNote", {
            outcome: t(`outcome.${application.decision}`),
            date: formatDate(application.decidedAt, locale),
          })}
        </p>
      ) : null}

      {application.clockPausedAt ? (
        <p className="rounded-lg bg-[var(--color-info-soft)] px-3 py-2 text-sm">
          {t("deadline.pausedHint")}
        </p>
      ) : null}

      <DetailsGrid application={application} />

      {panel}

      <DocumentsPanel
        applicationId={application.id}
        documents={documents}
        canAct={canAct && application.stage !== "closed"}
      />

      {canAct ? (
        <ActionPanel
          applicationId={application.id}
          stage={application.stage}
          options={options.map((option) => ({
            action: option.action,
            intent: option.intent,
            requiresRemarks: option.requiresRemarks,
          }))}
          suggestedAction={suggestion?.action ?? null}
          draft={draft}
        />
      ) : owner ? (
        <p className="card p-4 text-[var(--color-ink-soft)]">
          {t("application.readOnly", { stage: t(`stage.${application.stage}`) })}
        </p>
      ) : null}

      <HistoryPanel events={events} />
    </div>
  );
}
