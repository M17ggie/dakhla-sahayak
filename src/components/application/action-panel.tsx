"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { performAction, type ActionState } from "@/app/(app)/applications/[id]/actions";
import type { Stage } from "@/db/schema";
import type { Action } from "@/lib/workflow";

export type ActionOption = {
  action: Action;
  intent: "primary" | "caution" | "danger";
  requiresRemarks: boolean;
};

const INTENT_CLASS: Record<ActionOption["intent"], string> = {
  primary: "btn-primary",
  caution: "btn-quiet",
  danger: "btn-danger",
};

export function ActionPanel({
  applicationId,
  stage,
  options,
  suggestedAction,
  draft,
}: {
  applicationId: number;
  /** Sent back with the action so a file that moved on is not overwritten. */
  stage: Stage;
  options: ActionOption[];
  suggestedAction: Action | null;
  draft: string | null;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    performAction,
    {},
  );
  const [remarks, setRemarks] = useState("");

  const remarksNeeded = options.some((option) => option.requiresRemarks);

  return (
    <section className="card no-print p-4" aria-labelledby="actions-heading">
      <h2 id="actions-heading" className="mb-3 text-lg font-semibold">
        {t("application.actions.heading")}
      </h2>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="applicationId" value={applicationId} />
        <input type="hidden" name="expectedStage" value={stage} />
        <input type="hidden" name="aiSuggestion" value={suggestedAction ?? ""} />

        <div>
          <label className="label" htmlFor="remarks">
            {t("application.remarks.label")}
          </label>
          <textarea
            id="remarks"
            name="remarks"
            className="textarea"
            placeholder={t("application.remarks.placeholder")}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            aria-describedby="remarks-hint"
          />
          {remarksNeeded ? (
            <p id="remarks-hint" className="mt-1 text-sm text-[var(--color-ink-soft)]">
              {t("application.remarks.requiredNote")}
            </p>
          ) : null}
          {draft ? (
            <button
              type="button"
              className="btn btn-quiet mt-2"
              onClick={() => setRemarks(draft)}
            >
              {t("ai.useDraft")}
            </button>
          ) : null}
        </div>

        {state.error ? (
          <p
            role="alert"
            className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-[var(--color-danger)]"
          >
            {t(`error.${state.error}`)}
          </p>
        ) : null}

        <p className="text-sm text-[var(--color-ink-soft)]">
          {t("application.actions.aiHint")}
        </p>

        <div className="flex flex-wrap gap-3">
          {options.map((option) => (
            <button
              key={option.action}
              type="submit"
              name="action"
              value={option.action}
              disabled={pending}
              className={`btn ${INTENT_CLASS[option.intent]} ${
                option.action === suggestedAction ? "btn-suggested" : ""
              }`}
            >
              {t(`action.${option.action}`)}
            </button>
          ))}
        </div>

        {pending ? (
          <p role="status" className="text-sm text-[var(--color-ink-soft)]">
            {t("application.actions.working")}
          </p>
        ) : null}
      </form>
    </section>
  );
}
