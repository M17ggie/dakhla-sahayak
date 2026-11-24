import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import mr from "../../messages/mr.json";
import en from "../../messages/en.json";

type Messages = Record<string, unknown>;

const CATALOGUES: Record<Locale, Messages> = { mr, en };

/** English over Marathi, so an untranslated key still shows real text. */
function mergeDeep(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? mergeDeep(existing, value)
        : value;
  }
  return out;
}

function isPlainObject(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function resolveLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();

  return {
    locale,
    messages:
      locale === defaultLocale
        ? CATALOGUES[defaultLocale]
        : mergeDeep(CATALOGUES[defaultLocale], CATALOGUES[locale]),
    // Dates and money are formatted for India regardless of reading language:
    // staff read and write Latin digits with Indian grouping.
    timeZone: "Asia/Kolkata",
  };
});
