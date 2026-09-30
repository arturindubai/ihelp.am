import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { createSession, STAFF_ROLES } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { audit } from "@/server/audit";
import { exchangeGoogleCode, verifyState } from "@/server/services/oauth";
import { packGoogleSignupTicket } from "@/lib/googleSignupTicket";

/**
 * Возврат из Google.
 * - Ищем только по подтверждённому email (emailVerifiedAt IS NOT NULL): unverified email в
 *   чужом профиле не может перехватить вход настоящего владельца Google-аккаунта.
 * - Если email есть в системе, но не подтверждён — возвращаем google_not_linked.
 * - Если email в системе не найден — начинаем регистрацию: тикет с email+name из Google,
 *   редирект на /login?google-complete=TICKET, там пользователь вводит телефон.
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

  // Ищем только по подтверждённому email
  const user = await db.user.findFirst({
    where: { email: { equals: profile.email, mode: "insensitive" }, emailVerifiedAt: { not: null } },
  });

  if (!user) {
    // Проверяем, не добавил ли кто-то этот email в профиль без подтверждения
    const unverified = await db.user.findFirst({ where: { email: { equals: profile.email, mode: "insensitive" } } });
    if (unverified) return fail("google_not_linked");
    // Новый пользователь: тикет с данными из Google, редирект на форму телефона
    const ticket = packGoogleSignupTicket(
      { email: profile.email, name: profile.name || "", locale: "ru" },
      process.env.SESSION_SECRET || "dev",
    );
    return NextResponse.redirect(new URL(`/ru/login?google-complete=${encodeURIComponent(ticket)}`, base));
  }

  if (user.blocked) return fail("blocked");

  // Ставим emailVerifiedAt, если не было задано ранее (обратная совместимость)
  if (!user.emailVerifiedAt) {
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  }

  await createSession(user.id, user.role);
  await audit(user.id, "auth.google", "User", user.id, { email: profile.email });
  const next = (verifyState(state, process.env.SESSION_SECRET || "dev") ?? "").split("|")[1] || "";
  const dest = next.startsWith("/") ? `/ru${next}` : STAFF_ROLES.includes(user.role) ? "/ru/admin" : "/ru/account";
  return NextResponse.redirect(new URL(dest, base));
}
