import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { createSession, STAFF_ROLES } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { audit } from "@/server/audit";
import { alertTech } from "@/server/alerts";
import { html } from "@/server/notify";
import { exchangeGoogleCode, verifyState } from "@/server/services/oauth";

/**
 * Возврат из Google. Пускаем только тех, у кого в системе уже указан этот email:
 * новый аккаунт не создаём — в продукте человек привязан к номеру телефона.
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

  const user = await db.user.findFirst({ where: { email: { equals: profile.email, mode: "insensitive" } } });
  if (!user) {
    await alertTech("google-unknown", html`⚠️ <b>Вход через Google: аккаунт не привязан</b>\n${profile.email}`, 30);
    return fail("google_not_linked");
  }
  if (user.blocked) return fail("blocked");

  await createSession(user.id);
  await audit(user.id, "auth.google", "User", user.id, { email: profile.email });
  const next = (verifyState(state, process.env.SESSION_SECRET || "dev") ?? "").split("|")[1] || "";
  const dest = next.startsWith("/") ? `/ru${next}` : STAFF_ROLES.includes(user.role) ? "/ru/admin" : "/ru/account";
  return NextResponse.redirect(new URL(dest, base));
}
