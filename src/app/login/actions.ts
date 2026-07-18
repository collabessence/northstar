"use server";

import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, computeSessionToken, gateEnabled } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  const sitePassword = process.env.SITE_PASSWORD ?? "";

  if (!sitePassword || password !== sitePassword) {
    redirect(`/login?next=${encodeURIComponent(next)}&error=1`);
  }

  const token = await computeSessionToken(sitePassword);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  redirect(next && next.startsWith("/") ? next : "/");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function isGateEnabled() {
  return gateEnabled();
}
