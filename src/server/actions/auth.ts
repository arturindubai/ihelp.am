"use server";
import { headers } from "next/headers";
import type { OtpChannel } from "@prisma/client";
import { db } from "../db";
import { normalizePhone } from "@/lib/phone";
import { sendOtp, verifyOtp } from "../otp";
import { createSession, getCurrentUser, hash, logout } from "../auth";

export async function sendCodeAction(phoneRaw: string, channel: OtpChannel, locale = "ru") {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { ok: false as const, error: "phone" };
  const existing = await db.user.findUnique({ where: { phone } });
  if (existing?.blocked) return { ok: false as const, error: "blocked" };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
  const r = await sendOtp(phone, channel, ip, ["ru", "en", "am"].includes(locale) ? locale : "ru");
  return { ...r, phone };
}

export async function verifyCodeAction(phoneRaw: string, code: string, locale: string) {
  const phone = normalizePhone(phoneRaw);
  if (!phone || !/^\d{4,6}$/.test(code.trim())) return { ok: false as const, error: "code" };
  if (!(await verifyOtp(phone, code))) return { ok: false as const, error: "code" };
  let user = await db.user.findUnique({ where: { phone } });
  if (user?.blocked) return { ok: false as const, error: "blocked" };
  // Код запрошен из формы с уведомлением о политике конфиденциальности — фиксируем дату согласия
  if (!user) user = await db.user.create({ data: { phone, locale, privacyConsentAt: new Date() } });
  else if (!user.privacyConsentAt) user = await db.user.update({ where: { id: user.id }, data: { privacyConsentAt: new Date() } });
  // Если номер привязан к мастеру — выдаём роль мастера
  if (user.role === "CLIENT") {
    const m = await db.master.findFirst({ where: { phone, userId: null } });
    if (m) {
      await db.master.update({ where: { id: m.id }, data: { userId: user.id } });
      user = await db.user.update({ where: { id: user.id }, data: { role: "MASTER" } });
    }
  }
  // Новому пользователю сначала спрашиваем имя, сессию создаём после (иначе страница перерисуется раньше)
  if (!user.name) {
    const exp = Date.now() + 10 * 60_000;
    return { ok: true as const, needName: true, ticket: `${user.id}.${exp}.${hash(`${user.id}.${exp}`)}`, role: user.role };
  }
  await createSession(user.id);
  return { ok: true as const, needName: false, role: user.role };
}

export async function completeSignupAction(ticket: string, name: string) {
  const [id, exp, sig] = (ticket || "").split(".");
  if (!id || !exp || Number(exp) < Date.now() || sig !== hash(`${id}.${exp}`)) return { ok: false };
  const n = name.trim().slice(0, 80);
  if (!n) return { ok: false };
  await db.user.update({ where: { id }, data: { name: n } });
  await createSession(id);
  return { ok: true };
}

export async function setNameAction(name: string) {
  const u = await getCurrentUser();
  if (!u) return { ok: false };
  const n = name.trim().slice(0, 80);
  if (!n) return { ok: false };
  await db.user.update({ where: { id: u.id }, data: { name: n } });
  return { ok: true };
}

export async function logoutAction() {
  await logout();
}
