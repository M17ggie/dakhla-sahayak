import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ApplicationCard } from "@/components/application-card";
import type { Application } from "@/db/schema";
import { rankApplications } from "@/lib/priority";
import { getQueues, matchesQuery } from "@/server/repo";
import { getCurrentUser } from "@/server/session";

type Tab = "mine" | "withApplicant" | "closed" | "all";
const TABS: Tab[] = ["mine", "withApplicant", "closed", "all"];

function isTab(value: unknown): value is Tab {
  return typeof value === "string" && (TABS as string[]).includes(value);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  // The layout guards this route too, but layouts and pages render in parallel,
  // so the layout's redirect cannot be relied on to run first. Without its own
  // check this page would dereference a null user on an unauthenticated request.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const t = await getTranslations();

  const tab: Tab = isTab(params.tab) ? params.tab : "mine";
  const query = params.q?.trim() ?? "";

  // One clock for the whole page, so the counts and the chips agree.
  const now = new Date();
  const queues = await getQueues(user.roles, now);

  const lists: Record<Tab, Application[]> = {
    mine: queues.mine,
    withApplicant: queues.withApplicant,
    closed: queues.closed,
    all: queues.all,
  };

  const visible = rankApplications(
    lists[tab].filter((application) => matchesQuery(application, query)),
    now,
  );

  const stats = [
    { key: "pending", value: queues.counts.pending, tone: "" },
    {
      key: "overdue",
      value: queues.counts.overdue,
      tone: queues.counts.overdue > 0 ? "text-[var(--color-danger)]" : "",
    },
    {
      key: "dueSoon",
      value: queues.counts.dueSoon,
      tone: queues.counts.dueSoon > 0 ? "text-[var(--color-warn)]" : "",
    },
    { key: "closedThisWeek", value: queues.counts.closedThisWeek, tone: "" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
        <p className="text-[var(--color-ink-soft)]">
          {t("dashboard.greeting", { name: user.fullName })}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.key} className="card p-4">
            <dt className="text-sm text-[var(--color-ink-soft)]">
              {t(`dashboard.stat.${stat.key}`)}
            </dt>
            <dd className={`text-3xl font-bold ${stat.tone}`}>{stat.value}</dd>
          </div>
        ))}
      </dl>

      <form className="card flex flex-wrap items-end gap-3 p-4" role="search">
        <input type="hidden" name="tab" value={tab} />
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="q">
            {t("dashboard.search.label")}
          </label>
          <input
            id="q"
            name="q"
            type="search"
            className="input"
            defaultValue={query}
            placeholder={t("dashboard.search.placeholder")}
            aria-describedby="search-hint"
          />
        </div>
        <button type="submit" className="btn btn-primary">
          {t("common.search")}
        </button>
        {query ? (
          <Link href={`/?tab=${tab}`} className="btn btn-quiet">
            {t("common.clear")}
          </Link>
        ) : null}
        <p id="search-hint" className="w-full text-sm text-[var(--color-ink-soft)]">
          {t("dashboard.search.hint")}
        </p>
      </form>

      <nav className="flex flex-wrap gap-2" aria-label={t("dashboard.title")}>
        {TABS.map((candidate) => (
          <Link
            key={candidate}
            href={`/?tab=${candidate}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
            aria-current={candidate === tab ? "page" : undefined}
            className={`chip border px-3 py-1.5 ${
              candidate === tab
                ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                : "border-[var(--color-line)] bg-[var(--color-card)] text-[var(--color-ink-soft)]"
            }`}
          >
            {t(`dashboard.tab.${candidate}`)} ({lists[candidate].length})
          </Link>
        ))}
      </nav>

      {tab === "withApplicant" && queues.withApplicant.length > 0 ? (
        <p className="rounded-lg bg-[var(--color-info-soft)] px-3 py-2 text-sm">
          {t("deadline.pausedHint")}
        </p>
      ) : null}

      {visible.length > 0 ? (
        <>
          <p className="text-sm text-[var(--color-ink-soft)]">{t("dashboard.rankHint")}</p>
          <ul className="space-y-3">
            {visible.map((application) => (
              <ApplicationCard key={application.id} application={application} now={now} />
            ))}
          </ul>
        </>
      ) : (
        <p className="card p-6 text-center text-[var(--color-ink-soft)]">
          {query ? t("dashboard.emptySearch", { query }) : t("dashboard.empty")}
        </p>
      )}
    </div>
  );
}
