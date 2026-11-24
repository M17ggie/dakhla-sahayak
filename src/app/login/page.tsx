import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "@/server/session";
import { LanguageSwitcher } from "@/components/language-switcher";
import userFixtures from "@/db/fixtures/users.json";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  const t = await getTranslations();

  // The demo accounts are part of the fixture data, so the page and the seed
  // can never drift apart.
  const accounts = userFixtures.map((user) => ({
    username: user.username,
    password: user.password,
    designation: user.designation,
  }));

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("app.name")}</h1>
          <p className="text-[var(--color-ink-soft)]">{t("app.subtitle")}</p>
          <p className="text-sm text-[var(--color-ink-soft)]">{t("app.office")}</p>
        </div>
        <LanguageSwitcher />
      </div>

      <div className="card p-5">
        <h2 className="mb-1 text-lg font-semibold">{t("login.title")}</h2>
        <p className="mb-5 text-sm text-[var(--color-ink-soft)]">{t("login.intro")}</p>
        <LoginForm accounts={accounts} />
      </div>
    </main>
  );
}
