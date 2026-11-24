import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations();

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <div className="card p-6 text-center">
        <h1 className="mb-2 text-xl font-bold">{t("error.notFoundTitle")}</h1>
        <p className="mb-4 text-[var(--color-ink-soft)]">{t("error.notFoundBody")}</p>
        <Link href="/" className="btn btn-primary">
          {t("application.backToDashboard")}
        </Link>
      </div>
    </main>
  );
}
