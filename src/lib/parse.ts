/**
 * Reading numbers out of a form.
 *
 * An empty field must come back as nothing, never as zero. A cleared "verified
 * annual income" that silently read as 0 would pass every later check and put a
 * ₹0 approval in front of the officer as the suggested action.
 */
export function parseFormNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  // Deliberately strict: `Number()` accepts "", " ", "0x10" and "1e3".
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A whole count of people, or nothing. */
export function parseFormCount(value: unknown): number | null {
  const parsed = parseFormNumber(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

/** An amount of money, or nothing. Zero is a real answer. */
export function parseFormAmount(value: unknown): number | null {
  const parsed = parseFormNumber(value);
  return parsed !== null && parsed >= 0 ? Math.round(parsed) : null;
}
