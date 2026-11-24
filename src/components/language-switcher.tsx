import { getTranslations } from "next-intl/server";

import { setLocale } from "@/app/locale-actions";
import { locales, localeLabels } from "@/i18n/config";
import { resolveLocale } from "@/i18n/request";

/**
 * Two plain forms rather than a dropdown, so the switch also works with
 * JavaScript off and needs only one tap on a phone.
 */
export async function LanguageSwitcher() {
  const current = await resolveLocale();
  const t = await getTranslations("nav");

  return (
    <div
      className="no-print flex items-center gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-card)] p-1"
      role="group"
      aria-label={t("language")}
    >
      {locales.map((locale) => (
        <form key={locale} action={setLocale}>
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            aria-current={locale === current ? "true" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
              locale === current
                ? "bg-[var(--color-brand)] text-white"
                : "text-[var(--color-ink-soft)]"
            }`}
          >
            {localeLabels[locale]}
          </button>
        </form>
      ))}
    </div>
  );
}
