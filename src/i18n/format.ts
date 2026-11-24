import type { Locale } from "./config";

/**
 * Money and dates are formatted in one place, because both have to look the way
 * they do on Aaple Sarkar and on the paper forms: Indian digit grouping and
 * Latin numerals, with the month name in the reading language.
 */

const RUPEES = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** `₹1,20,000` — lakh-crore grouping, no paise. */
export function formatRupees(amount: number): string {
  return RUPEES.format(amount);
}

const MONTHS: Record<Locale, string[]> = {
  mr: [
    "जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून",
    "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर",
  ],
  en: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
};

const IST_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type DateParts = { day: number; month: number; year: number; hour: string; minute: string };

/** The calendar date as it is in India, not in the server's zone. */
function partsInIst(date: Date): DateParts {
  const parts = Object.fromEntries(
    IST_PARTS.formatToParts(date).map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return {
    day: Number(parts.day),
    month: Number(parts.month),
    year: Number(parts.year),
    hour: parts.hour,
    minute: parts.minute,
  };
}

/** `24 नोव्हेंबर 2026`. */
export function formatDate(date: Date, locale: Locale): string {
  const { day, month, year } = partsInIst(date);
  return `${day} ${MONTHS[locale][month - 1]} ${year}`;
}

/** `24 नोव्हेंबर 2026, 14:35`. */
export function formatDateTime(date: Date, locale: Locale): string {
  const { hour, minute } = partsInIst(date);
  return `${formatDate(date, locale)}, ${hour}:${minute}`;
}

/** `24/11/2026`, for the certificate and the orders. */
export function formatDateNumeric(date: Date): string {
  const { day, month, year } = partsInIst(date);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function formatPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${value}%`;
}

/** `1.1` hectares, without a trailing `.0`. */
export function formatHectares(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}
