import crypto from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { googleAuthUrl, signState } from "@/server/services/oauth";

/** Начало привязки Google к существующему профилю: проверяем сессию, ставим одноразовое состояние и уходим на Google */
export async function GET(req: Request) {
  const base = process.env.APP_URL || new URL(req.url).origin;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/ru/login?next=/account", base));

  const s = await getSettings();
  if (!s.google.enabled || !s.google.clientId || !s.google.clientSecret) {
    return NextResponse.redirect(new URL("/ru/account?google_link_error=google_off", base));
  }

  const state = signState(`${crypto.randomBytes(12).toString("hex")}|link`, process.env.SESSION_SECRET || "dev");
  (await cookies()).set("g_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: "/", maxAge: 600 });
  return NextResponse.redirect(googleAuthUrl(s, state));
}
