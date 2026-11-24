import { formatHectares, formatPercent, formatRupees } from "@/i18n/format";

/**
 * Turning a finding's parameters into something readable.
 *
 * The rules deliberately hand back raw codes and numbers. This is where they
 * become rupees with Indian grouping, percentages with a sign, and document
 * names in the reader's language — one place, so a number never appears
 * formatted two different ways on the same screen.
 */

export type Translator = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

export type RawParams = Record<string, string | number | boolean>;

/** Parameter names that hold an amount in rupees. */
const MONEY = new Set([
  "documentIncome",
  "declaredIncome",
  "estimatedIncome",
  "verifiedIncome",
  "certifiedIncome",
]);

/** Parameter names whose value is a code to look up in the catalogue. */
const CODE_NAMESPACE: Record<string, string> = {
  docType: "docType",
  requirement: "requirement",
  occupation: "occupation",
  purpose: "purpose",
  finding: "ai.findingLabel",
  suggested: "action",
  action: "action",
  stage: "stage",
  from: "stage",
  to: "stage",
  level: "ai.confidence",
};

export function displayParams(params: RawParams, t: Translator): Record<string, string | number> {
  const out: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(params)) {
    if (MONEY.has(key) && typeof value === "number") {
      out[key] = formatRupees(value);
      continue;
    }

    if (key === "gapPercent" && typeof value === "number") {
      out[key] = formatPercent(value);
      continue;
    }

    if (key === "areaHectares" && typeof value === "number") {
      out[key] = formatHectares(value);
      continue;
    }

    if (key === "score" && typeof value === "number") {
      out[key] = `${Math.round(value * 100)}%`;
      continue;
    }

    if (key === "irrigated") {
      // The template reads `{kind}`, because "irrigated" and "rain-fed" are two
      // words in Marathi and not a yes/no.
      out.kind = t(value ? "documents.irrigated" : "documents.rainfed");
      continue;
    }

    if (key === "accepts" && typeof value === "string") {
      out[key] = value
        .split(",")
        .filter(Boolean)
        .map((code) => t(`docType.${code}`))
        .join(", ");
      continue;
    }

    const namespace = CODE_NAMESPACE[key];
    if (namespace && typeof value === "string") {
      out[key] = t(`${namespace}.${value}`);
      continue;
    }

    out[key] = typeof value === "boolean" ? (value ? t("common.yes") : t("common.no")) : value;
  }

  return out;
}
