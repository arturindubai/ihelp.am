import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { verifyUnsubscribeToken } from "@/lib/emailToken";

const APP_URL = () => (process.env.APP_URL || "https://ihelp.am").replace(/\/$/, "");

/** GET /api/email/unsubscribe?token=<signed-token>&locale=ru
 *  Проверяет токен и редиректит на страницу с кнопкой подтверждения.
 *  Простое открытие ссылки ничего не меняет — отписка только кнопкой (POST). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") || "";
  const locale = searchParams.get("locale") || "ru";
  const safeLocale = ["ru", "en", "am"].includes(locale) ? locale : "ru";

  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    return NextResponse.redirect(`${APP_URL()}/${safeLocale}`);
  }

  return NextResponse.redirect(
    `${APP_URL()}/${safeLocale}/email/unsubscribed?token=${encodeURIComponent(token)}`,
  );
}

/** POST /api/email/unsubscribe?token=<signed-token>&locale=ru
 *  Устанавливает emailUnsubscribedAt; редиректит на страницу с подтверждением (без токена). */
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") || "";
  const locale = searchParams.get("locale") || "ru";
  const safeLocale = ["ru", "en", "am"].includes(locale) ? locale : "ru";

  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    return NextResponse.redirect(`${APP_URL()}/${safeLocale}`);
  }

  await db.user.updateMany({
    where: { id: userId, emailUnsubscribedAt: null },
    data: { emailUnsubscribedAt: new Date() },
  });

  return NextResponse.redirect(`${APP_URL()}/${safeLocale}/email/unsubscribed`);
}
