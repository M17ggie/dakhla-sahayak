import "server-only";

import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import type { Role } from "@/db/schema";

export type SessionUser = {
  id: number;
  username: string;
  fullName: string;
  fullNameEn: string;
  designation: string;
  roles: Role[];
};

export type SessionData = { user?: SessionUser };

/**
 * Only used so `npm run dev` works with no setup. Anyone holding this string can
 * forge a cookie, which is why production must set SESSION_SECRET.
 */
const DEVELOPMENT_SECRET = "dakhla-sahayak-local-development-only-secret";

let warned = false;

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;

  if (!warned) {
    warned = true;
    console.warn(
      secret
        ? "SESSION_SECRET is shorter than 32 characters; falling back to the public development secret. Sessions can be forged."
        : "SESSION_SECRET is not set; using the public development secret. Sessions can be forged. Set it before deploying.",
    );
  }
  return DEVELOPMENT_SECRET;
}

function sessionOptions(): SessionOptions {
  return {
    password: sessionSecret(),
    cookieName: "dakhla_session",
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    },
  };
}

export async function getSession() {
  const store = await cookies();
  return getIronSession<SessionData>(store, sessionOptions());
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session.user ?? null;
}
