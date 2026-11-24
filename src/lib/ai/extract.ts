import type { DocType } from "@/db/schema";
import keywords from "./ocr-keywords.json";

/**
 * Turning the text that came out of OCR into the few fields the checks need.
 *
 * OCR of a photographed Marathi document is never clean, so nothing here is
 * trusted: whatever is extracted is shown to the clerk to confirm or correct
 * before it is saved to the file.
 */

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

/** Marathi documents mix Devanagari and Latin digits, often on the same line. */
export function normaliseDigits(text: string): string {
  let out = "";
  for (const ch of text) {
    const index = DEVANAGARI_DIGITS.indexOf(ch);
    out += index >= 0 ? String(index) : ch;
  }
  return out;
}

/** `₹ १,२०,०००/-` and `Rs. 1,20,000` both become 120000. */
export function parseAmount(text: string): number | null {
  const digits = normaliseDigits(text).replace(/[,\s]/g, "");
  const match = digits.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.round(value) : null;
}

/** Land area in hundredths of a hectare, converting acres and gunthas. */
export function parseLandArea(text: string): number | null {
  const normalised = normaliseDigits(text);
  const match = normalised.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;

  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;

  const hasUnit = (unit: keyof typeof keywords.units) =>
    keywords.units[unit].some((word) => text.includes(word));

  if (hasUnit("acre")) return Math.round(value * 0.4047 * 100);
  if (hasUnit("guntha")) return Math.round(value * 0.0101 * 100);
  return Math.round(value * 100);
}

export function detectDocType(text: string): DocType | null {
  const entries = Object.entries(keywords.docType) as Array<[DocType, string[]]>;

  let best: { type: DocType; hits: number } | null = null;
  for (const [type, words] of entries) {
    const hits = words.filter((word) => text.includes(word)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { type, hits };
  }

  return best?.type ?? null;
}

/**
 * The text that follows a label, either after the colon on the same line or,
 * when the label sits alone, on the line below.
 */
function valueAfterLabel(lines: string[], labels: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Longest label first, so "निव्वळ वेतन" wins over "वेतन".
    const label = [...labels]
      .sort((a, b) => b.length - a.length)
      .find((candidate) => line.includes(candidate));
    if (!label) continue;

    const after = line.slice(line.indexOf(label) + label.length).replace(/^[\s:：|–—-]+/, "");
    if (after.trim()) return after.trim();

    const next = lines[i + 1]?.trim();
    if (next) return next;
  }
  return null;
}

/** A person's name, with the labels and stray punctuation taken off. */
function cleanName(value: string): string | null {
  const cleaned = value
    .replace(/[0-9०-९]/g, "")
    .replace(/[|_~^*]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[.,:;-]+$/, "")
    .trim();

  // Two characters cannot be a name; OCR noise often leaves a single glyph.
  return cleaned.length >= 3 ? cleaned : null;
}

export type ExtractedFields = {
  docType: DocType | null;
  nameOnDocument: string | null;
  addressOnDocument: string | null;
  monthlyNetPay: number | null;
  annualIncome: number | null;
  landAreaCentiHectares: number | null;
  irrigated: boolean | null;
};

export function extractFields(rawText: string): ExtractedFields {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const docType = detectDocType(rawText);

  const nameValue = valueAfterLabel(lines, keywords.fields.name);
  const addressValue = valueAfterLabel(lines, keywords.fields.address);
  const netPayValue = valueAfterLabel(lines, keywords.fields.monthlyNetPay);
  const annualValue = valueAfterLabel(lines, keywords.fields.annualIncome);
  const areaValue = valueAfterLabel(lines, keywords.fields.landArea);

  const irrigated = keywords.irrigation.irrigated.some((word) => rawText.includes(word))
    ? true
    : keywords.irrigation.rainfed.some((word) => rawText.includes(word))
      ? false
      : null;

  return {
    docType,
    nameOnDocument: nameValue ? cleanName(nameValue) : null,
    addressOnDocument: addressValue?.replace(/\s{2,}/g, " ").trim() || null,
    monthlyNetPay: netPayValue ? parseAmount(netPayValue) : null,
    annualIncome: annualValue ? parseAmount(annualValue) : null,
    landAreaCentiHectares: areaValue ? parseLandArea(areaValue) : null,
    irrigated: docType === "land_7_12" ? irrigated : null,
  };
}
