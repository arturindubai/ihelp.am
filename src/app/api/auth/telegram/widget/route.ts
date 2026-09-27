import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { createSession, STAFF_ROLES } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { audit } from "@/server/audit";
import { alertTech } from "@/server/alerts";
import { html } from "@/server/notify";
import { parseTelegramWidgetParams, verifyTelegramWidgetData } from "@/lib/telegramWidget";

/**
 * Callback Telegram Login Widget: вход в аккаунт (AUTH-10, часть 2).
 * Принимает подписанные данные от Telegram, находит пользователя по telegramId и создаёт сессию.
 * Пускаем только тех, у кого telegramId уже привязан в профиле — как Google/Apple по email.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.APP_URL || url.origin;
  const fail = (reason: string) => NextResponse.redirect(new URL(`/ru/login?error=${reason}`, base));

  const s = await getSettings();
  if (!s.telegramWidget.enabled) return fail("telegram_off");

  const botToken = s.notify.telegramBotToken;
  if (!botToken) return fail("telegram_failed");

  const data = parseTelegramWidgetParams(url.searchParams);
  if (!data) return fail("telegram_state");

  if (!verifyTelegramWidgetData(data, botToken)) return fail("telegram_state");

  const user = await db.user.findUnique({ where: { telegramId: data.id } });
  if (!user) {
    await alertTech("telegram-widget-unknown", html`⚠️ <b>Вход через Telegram Widget: аккаунт не привязан</b>\ntelegram_id=${data.id}`, 30);
    return fail("telegram_not_linked");
  }
  if (user.blocked) return fail("blocked");

  await createSession(user.id);
  await audit(user.id, "auth.telegram_widget", "User", user.id, { telegramId: data.id });
  await alertTech("telegram-widget-login", html`🔓 <b>Вход через Telegram Widget</b>\n${user.phone}`, 5);

  const next = url.searchParams.get("next") || "";
  const dest = next.startsWith("/ru/") ? next : STAFF_ROLES.includes(user.role) ? "/ru/admin" : "/ru/account";
  return NextResponse.redirect(new URL(dest, base));
}
