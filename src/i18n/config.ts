/** Marathi is the default; English exists so a reviewer can read the screens. */
export const locales = ["mr", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "mr";

export const LOCALE_COOKIE = "NEXT_LOCALE";

export const localeLabels: Record<Locale, string> = {
  mr: "मराठी",
  en: "English",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
