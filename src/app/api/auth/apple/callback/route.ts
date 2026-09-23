import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { createSession, STAFF_ROLES } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { audit } from "@/server/audit";
import { exchangeAppleCode, verifyState } from "@/server/services/oauth";
import { packSignupTicket } from "@/server/services/signupTicket";

/**
 * Возврат из Apple. В отличие от Google, Apple шлёт форму POST (response_mode=form_post), не GET.
 * Если email уже привязан — обычный вход. Если нет (AUTH-11) — email проверен Apple, телефон ещё
 * нет: на страницу входа с тикетом на завершение регистрации, телефон подтвердят SMS-кодом.
 */
export async function POST(req: Request) {
  const base = process.env.APP_URL || new URL(req.url).origin;
  // 303 после POST — иначе браузер попробует повторить POST на страницу входа
  const fail = (reason: string) => NextResponse.redirect(new URL(`/ru/login?error=${reason}`, base), { status: 303 });

  const s = await getSettings();
  if (!s.apple.enabled) return fail("apple_off");

  const form = await req.formData();
  const jar = await cookies();
  const saved = jar.get("a_state")?.value ?? "";
  jar.delete("a_state");
  const state = String(form.get("state") ?? "");
  const code = String(form.get("code") ?? "");
  if (!code || !state || state !== saved || !verifyState(state, process.env.SESSION_SECRET || "dev")) return fail("apple_state");

  const profile = await exchangeAppleCode(s, code);
  if (!profile || !profile.emailVerified) return fail("apple_failed");

  const email = profile.email.toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    await audit(null, "auth.apple.signup_start", "User", null, { email });
    const ticket = packSignupTicket({ kind: "new", phone: "", email, locale: "ru" });
    return NextResponse.redirect(new URL(`/ru/login?complete=${encodeURIComponent(ticket)}`, base), { status: 303 });
  }
  if (user.blocked) return fail("blocked");

  await createSession(user.id);
  await audit(user.id, "auth.apple", "User", user.id, { email });
  const next = (verifyState(state, process.env.SESSION_SECRET || "dev") ?? "").split("|")[1] || "";
  const dest = next.startsWith("/") ? `/ru${next}` : STAFF_ROLES.includes(user.role) ? "/ru/admin" : "/ru/account";
  return NextResponse.redirect(new URL(dest, base), { status: 303 });
}
