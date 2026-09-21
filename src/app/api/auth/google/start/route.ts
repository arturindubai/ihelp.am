import crypto from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSettings } from "@/server/settings";
import { googleAuthUrl, signState } from "@/server/services/oauth";

/** Начало входа через Google: ставим одноразовое состояние в cookie и уходим на Google */
export async function GET(req: Request) {
  const s = await getSettings();
  const base = process.env.APP_URL || new URL(req.url).origin;
  if (!s.google.enabled || !s.google.clientId || !s.google.clientSecret) {
    return NextResponse.redirect(new URL("/ru/login?error=google_off", base));
  }
  const next = new URL(req.url).searchParams.get("next") || "";
  const state = signState(`${crypto.randomBytes(12).toString("hex")}|${next}`, process.env.SESSION_SECRET || "dev");
  (await cookies()).set("g_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: "/", maxAge: 600 });
  return NextResponse.redirect(googleAuthUrl(s, state));
}
