import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { logout } from "@/app/login/actions";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getCurrentUser } from "@/server/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Every page behind this layout needs a session; the check lives on the server
  // and is repeated inside each action that changes anything.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations();

  return (
    <div className="min-h-dvh">
      <header className="no-print border-b border-[var(--color-line)] bg-[var(--color-card)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link href="/" className="mr-auto">
            <span className="block font-bold">{t("app.name")}</span>
            <span className="block text-sm text-[var(--color-ink-soft)]">
              {t("app.office")}
            </span>
          </Link>

          <nav className="flex items-center gap-4 text-sm font-semibold">
            <Link href="/">{t("nav.dashboard")}</Link>
            <Link href="/metrics">{t("nav.metrics")}</Link>
          </nav>

          <LanguageSwitcher />

          <div className="flex items-center gap-3 text-sm">
            <span className="text-[var(--color-ink-soft)]">
              {t("nav.signedInAs", {
                name: user.fullName,
                designation: t(`designation.${user.designation}`),
              })}
            </span>
            <form action={logout}>
              <button type="submit" className="btn btn-quiet px-3 py-1.5 text-sm">
                {t("nav.logout")}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
