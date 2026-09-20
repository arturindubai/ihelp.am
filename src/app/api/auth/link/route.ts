import crypto from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { createSession } from "@/server/auth";
import { audit } from "@/server/audit";
import { alertTech } from "@/server/alerts";
import { html } from "@/server/notify";

/**
 * Вход владельца по секретной ссылке — запасной способ, пока не подключены каналы кода (задача AUTH-1).
 *   http://<сайт>/api/auth/link?token=<ADMIN_LOGIN_TOKEN из .env>
 * Работает только для номера ADMIN_PHONE, сессия на 7 дней, каждое использование —
 * запись в журнал и тех-алерт. Пустой ADMIN_LOGIN_TOKEN полностью выключает вход по ссылке.
 */
const SESSION_DAYS = 7;

function equal(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function GET(req: Request) {
  const expected = process.env.ADMIN_LOGIN_TOKEN;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const base = process.env.APP_URL || new URL(req.url).origin;
  if (!expected || !token || !equal(token, expected)) {
    await alertTech("admin-link-denied", "⚠️ <b>Неудачная попытка входа по ссылке владельца</b>", 30);
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Владелец: номер из ADMIN_PHONE, иначе — первый аккаунт с ролью OWNER
  const phone = process.env.ADMIN_PHONE ?? "";
  const user = (phone ? await db.user.findUnique({ where: { phone } }) : null) ?? (await db.user.findFirst({ where: { role: "OWNER" }, orderBy: { createdAt: "asc" } }));
  if (!user) return NextResponse.json({ error: "owner_not_found" }, { status: 500 });

  await createSession(user.id, SESSION_DAYS);
  await audit(user.id, "auth.link", "User", user.id);
  const ua = req.headers.get("user-agent")?.slice(0, 120) ?? "";
  await alertTech("admin-link-used", html`🔑 <b>Вход владельца по ссылке</b>\n${user.phone}\n${ua}`, 1);
  return NextResponse.redirect(new URL("/ru/admin", base));
}
