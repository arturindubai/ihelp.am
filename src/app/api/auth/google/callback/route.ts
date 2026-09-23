import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { createSession, STAFF_ROLES } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { audit } from "@/server/audit";
import { exchangeGoogleCode, verifyState } from "@/server/services/oauth";
import { packSignupTicket } from "@/server/services/signupTicket";

/**
 * Возврат из Google. Если email уже привязан к аккаунту — обычный вход. Если нет (AUTH-11) —
 * email от Google уже проверен провайдером, но телефон ещё нет: отправляем на страницу входа
 * с тикетом на завершение регистрации — там попросят телефон и подтвердят его SMS-кодом.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.APP_URL || url.origin;
  const fail = (reason: string) => NextResponse.redirect(new URL(`/ru/login?error=${reason}`, base));

  const s = await getSettings();
  if (!s.google.enabled) return fail("google_off");

  const jar = await cookies();
  const saved = jar.get("g_state")?.value ?? "";
  jar.delete("g_state");
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!code || !state || state !== saved || !verifyState(state, process.env.SESSION_SECRET || "dev")) return fail("google_state");

  const profile = await exchangeGoogleCode(s, code);
  if (!profile || !profile.emailVerified) return fail("google_failed");

  const email = profile.email.toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    await audit(null, "auth.google.signup_start", "User", null, { email });
    const ticket = packSignupTicket({ kind: "new", phone: "", email, locale: "ru" });
    return NextResponse.redirect(new URL(`/ru/login?complete=${encodeURIComponent(ticket)}`, base));
  }
  if (user.blocked) return fail("blocked");

  await createSession(user.id);
  await audit(user.id, "auth.google", "User", user.id, { email });
  const next = (verifyState(state, process.env.SESSION_SECRET || "dev") ?? "").split("|")[1] || "";
  const dest = next.startsWith("/") ? `/ru${next}` : STAFF_ROLES.includes(user.role) ? "/ru/admin" : "/ru/account";
  return NextResponse.redirect(new URL(dest, base));
}
