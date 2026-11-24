"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

import { findUserByUsername } from "@/server/repo";
import { getSession } from "@/server/session";

export type LoginState = { error?: "failed" | "unexpected" };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!username.trim() || !password) return { error: "failed" };

  const user = await findUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return { error: "failed" };
  }

  const session = await getSession();
  session.user = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    fullNameEn: user.fullNameEn,
    designation: user.designation,
    roles: user.roles,
  };
  await session.save();

  redirect("/");
}

export async function logout(): Promise<void> {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
