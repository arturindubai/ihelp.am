import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { createSession } from "@/server/auth";
import { audit } from "@/server/audit";
import { alertTech } from "@/server/alerts";
import { html } from "@/server/notify";
import { linkLoginDecision } from "@/lib/authLink";

/**
 * Вход владельца по секретной ссылке — запасной способ на случай отказа каналов OTP.
 *   http://<сайт>/api/auth/link?token=<ADMIN_LOGIN_TOKEN из .env>
 * Пустой ADMIN_LOGIN_TOKEN → 410 (ссылка отключена, вход по коду).
 * Каждое использование — запись в журнал и тех-алерт.
 */
export async function GET(req: Request) {
  const expected = process.env.ADMIN_LOGIN_TOKEN;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const base = process.env.APP_URL || new URL(req.url).origin;
  const decision = linkLoginDecision(token, expected);
  if (decision === 410) {
    return NextResponse.json({ error: "disabled" }, { status: 410 });
  }
  if (decision === 403) {
    await alertTech("admin-link-denied", "⚠️ <b>Неудачная попытка входа по ссылке владельца</b>", 30);
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Владелец: номер из ADMIN_PHONE, иначе — первый аккаунт с ролью OWNER
  const phone = process.env.ADMIN_PHONE ?? "";
  const user = (phone ? await db.user.findUnique({ where: { phone } }) : null) ?? (await db.user.findFirst({ where: { role: "OWNER" }, orderBy: { createdAt: "asc" } }));
  if (!user) return NextResponse.json({ error: "owner_not_found" }, { status: 500 });

  await createSession(user.id, user.role);
  await audit(user.id, "auth.link", "User", user.id);
  const ua = req.headers.get("user-agent")?.slice(0, 120) ?? "";
  await alertTech("admin-link-used", html`🔑 <b>Вход владельца по ссылке</b>\n${user.phone}\n${ua}`, 1);
  return NextResponse.redirect(new URL("/ru/admin", base));
}
