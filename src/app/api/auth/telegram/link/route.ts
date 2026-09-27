import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { audit } from "@/server/audit";
import { parseTelegramWidgetParams, verifyTelegramWidgetData } from "@/lib/telegramWidget";

/**
 * Callback привязки Telegram из личного кабинета (AUTH-10, часть 2).
 * Пользователь уже вошёл в аккаунт; этот маршрут привязывает telegramId к его профилю.
 * Если telegramId уже у кого-то есть — ошибка telegram_conflict.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.APP_URL || url.origin;
  const next = url.searchParams.get("next") || "/ru/account";
  const failAccount = (reason: string) => NextResponse.redirect(new URL(`/ru/account?telegram_error=${reason}`, base));

  const s = await getSettings();
  if (!s.telegramWidget.enabled) return failAccount("off");

  const botToken = s.notify.telegramBotToken;
  if (!botToken) return failAccount("failed");

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/ru/login?next=/account", base));

  const data = parseTelegramWidgetParams(url.searchParams);
  if (!data || !verifyTelegramWidgetData(data, botToken)) return failAccount("state");

  const existing = await db.user.findUnique({ where: { telegramId: data.id } });
  if (existing && existing.id !== user.id) return failAccount("conflict");

  await db.user.update({
    where: { id: user.id },
    data: {
      telegramId: data.id,
      telegramUsername: data.username ?? null,
    },
  });

  await audit(user.id, "profile.telegram_link", "User", user.id, { telegramId: data.id });

  const dest = next.startsWith("/ru/") ? next : "/ru/account";
  return NextResponse.redirect(new URL(dest, base));
}
