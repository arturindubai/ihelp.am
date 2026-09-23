import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { createSession, STAFF_ROLES } from "@/server/auth";
import { audit } from "@/server/audit";
import { alertTech } from "@/server/alerts";
import { html } from "@/server/notify";
import { verifyState } from "@/server/services/oauth";

/**
 * Вход по одноразовой ссылке из Telegram-бота (задача AUTH-10, способ «через бота»).
 * Ссылку прислал сам бот в ответ на «Поделиться номером» — Telegram уже подтвердил владение
 * номером на своей стороне, отдельный код не нужен. Ссылка живёт 10 минут — тот же signState/
 * verifyState, что у входа через Google и Apple.
 */
export async function GET(req: Request) {
  const base = process.env.APP_URL || new URL(req.url).origin;
  const fail = (reason: string) => NextResponse.redirect(new URL(`/ru/login?error=${reason}`, base));

  const token = new URL(req.url).searchParams.get("token") ?? "";
  const userId = verifyState(token, process.env.SESSION_SECRET || "dev");
  if (!userId) return fail("telegram_state");

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return fail("telegram_failed");
  if (user.blocked) return fail("blocked");

  await createSession(user.id);
  await audit(user.id, "auth.telegram", "User", user.id);
  await alertTech("telegram-login", html`🔓 <b>Вход через Telegram-бота</b>\n${user.phone}`, 5);
  const dest = user.role === "MASTER" ? "/ru/pro" : STAFF_ROLES.includes(user.role) ? "/ru/admin" : "/ru/account";
  return NextResponse.redirect(new URL(dest, base));
}
