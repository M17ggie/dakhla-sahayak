import { displayParams, type Translator } from "@/lib/ai/display";
import type { DecisionBrief, Finding } from "@/lib/ai/assistant";

/**
 * The drafts the staff edit: the SMS to the applicant and the order.
 *
 * Both are templates from the message catalogue with the file's own figures put
 * in. Nothing is invented, which matters when the text goes into a legal order.
 */

/** Finding codes that have wording short enough for an SMS. */
const SMS_CODES = new Set([
  "missing_document",
  "name_mismatch",
  "address_outside_village",
]);

/** Only the points the citizen can actually do something about go into the SMS. */
export function smsDraft(
  applicationNumber: string,
  findings: readonly Finding[],
  t: Translator,
): string | null {
  const lines = findings
    .filter((finding) => finding.fixableByApplicant && SMS_CODES.has(finding.code))
    .map(
      (finding, index) =>
        `${index + 1}. ${t(`ai.findingSms.${finding.code}`, displayParams(finding.params, t))}`,
    );

  if (!lines.length) return null;

  return t("ai.sms.body", { number: applicationNumber, items: lines.join("\n") });
}

export function orderDraft(brief: DecisionBrief, t: Translator): string {
  return t(`ai.order.${brief.orderTemplate}`, displayParams(brief.orderParams, t));
}
