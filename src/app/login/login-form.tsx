"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { login, type LoginState } from "./actions";

export type DemoAccount = {
  username: string;
  password: string;
  designation: string;
};

export function LoginForm({ accounts }: { accounts: DemoAccount[] }) {
  const t = useTranslations("login");
  const tDesignation = useTranslations("designation");
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});
  const [credentials, setCredentials] = useState({ username: "", password: "" });

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <div>
          <label className="label" htmlFor="username">
            {t("username")}
          </label>
          <input
            id="username"
            name="username"
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            required
            value={credentials.username}
            onChange={(event) =>
              setCredentials((current) => ({ ...current, username: event.target.value }))
            }
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            {t("password")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete="current-password"
            required
            value={credentials.password}
            onChange={(event) =>
              setCredentials((current) => ({ ...current, password: event.target.value }))
            }
          />
        </div>

        {state.error ? (
          <p
            role="alert"
            className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-[var(--color-danger)]"
          >
            {t("failed")}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? t("working") : t("submit")}
        </button>
      </form>

      <section aria-labelledby="demo-accounts" className="border-t border-[var(--color-line)] pt-5">
        <h2 id="demo-accounts" className="font-semibold">
          {t("demoHeading")}
        </h2>
        <p className="mb-3 text-sm text-[var(--color-ink-soft)]">{t("demoHint")}</p>
        <ul className="space-y-2">
          {accounts.map((account) => (
            <li key={account.username}>
              <button
                type="button"
                className="btn btn-quiet w-full justify-between text-left"
                onClick={() =>
                  setCredentials({ username: account.username, password: account.password })
                }
              >
                <span>{tDesignation(account.designation)}</span>
                <span className="font-mono text-sm text-[var(--color-ink-soft)]">
                  {account.username} / {account.password}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
