"use server";
import { headers } from "next/headers";
import type { OtpChannel } from "@prisma/client";
import { db } from "../db";
import { normalizePhone } from "@/lib/phone";
import { sendOtp, verifyOtp } from "../otp";
import { createSession, getCurrentUser, logout } from "../auth";
import { packSignupTicket, unpackSignupTicket } from "../services/signupTicket";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Если номер уже привязан к мастеру без аккаунта — выдаём роль мастера */
async function linkMasterRole(phone: string, userId: string, role: string) {
  if (role !== "CLIENT") return role;
  const m = await db.master.findFirst({ where: { phone, userId: null } });
  if (!m) return role;
  await db.master.update({ where: { id: m.id }, data: { userId } });
  await db.user.update({ where: { id: userId }, data: { role: "MASTER" } });
  return "MASTER";
}

export async function sendCodeAction(phoneRaw: string, channel: OtpChannel, locale = "ru") {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { ok: false as const, error: "phone" };
  const existing = await db.user.findUnique({ where: { phone } });
  if (existing?.blocked) return { ok: false as const, error: "blocked" };
  // Новому номеру аккаунт заводим только при SMS-подтверждении (AUTH-11) — не WhatsApp и не Telegram,
  // сколько бы каналов ни было подключено. Уже заведённым пользователям выбор канала не ограничиваем.
  const effectiveChannel: OtpChannel = existing ? channel : "SMS";
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
  const r = await sendOtp(phone, effectiveChannel, ip, ["ru", "en", "am"].includes(locale) ? locale : "ru");
  return { ...r, phone, channel: effectiveChannel };
}

/**
 * trustedEmail — email, уже подтверждённый провайдером (Google/Apple) до входа в этот шаг: его не
 * переспрашиваем. Для существующих пользователей значения не имеет — они логинятся как раньше.
 */
export async function verifyCodeAction(phoneRaw: string, code: string, locale: string, trustedEmail?: string) {
  const phone = normalizePhone(phoneRaw);
  if (!phone || !/^\d{4,6}$/.test(code.trim())) return { ok: false as const, error: "code" };
  if (!(await verifyOtp(phone, code))) return { ok: false as const, error: "code" };
  const user = await db.user.findUnique({ where: { phone } });
  if (user?.blocked) return { ok: false as const, error: "blocked" };

  if (!user) {
    // Новый номер: аккаунт не создаём здесь — сначала email (если ещё не известен) и имя, все вместе
    // в completeSignupAction. Тикет живёт 10 минут, дальше телефон снова пройдёт SMS-проверку заново.
    const email = (trustedEmail || "").trim().toLowerCase();
    const safeLocale = ["ru", "en", "am"].includes(locale) ? locale : "ru";
    const ticket = packSignupTicket({ kind: "new", phone, email, locale: safeLocale });
    return { ok: true, needProfile: true, ticket, requireEmail: !email, prefillEmail: email || undefined, role: "CLIENT" } as const;
  }

  let u = user;
  // Код запрошен из формы с уведомлением о политике конфиденциальности — фиксируем дату согласия
  if (!u.privacyConsentAt) u = await db.user.update({ where: { id: u.id }, data: { privacyConsentAt: new Date() } });
  const role = await linkMasterRole(phone, u.id, u.role);
  // Редкий случай — существующий пользователь без имени (старые данные): просим только имя, email не обязателен
  if (!u.name) {
    return { ok: true, needProfile: true, ticket: packSignupTicket({ kind: "existing", userId: u.id }), requireEmail: false, role } as const;
  }
  await createSession(u.id);
  return { ok: true, needProfile: false, role } as const;
}

export async function completeSignupAction(ticket: string, name: string, email?: string) {
  const n = name.trim().slice(0, 80);
  if (!n) return { ok: false as const, error: "name" };
  const t = unpackSignupTicket(ticket);
  if (!t) return { ok: false as const, error: "ticket" };

  if (t.kind === "existing") {
    const user = await db.user.update({ where: { id: t.userId }, data: { name: n } });
    await createSession(t.userId);
    return { ok: true as const, role: user.role };
  }

  // t.kind === "new" — телефон уже подтверждён SMS в verifyCodeAction
  const finalEmail = t.email || (email || "").trim().toLowerCase();
  if (!finalEmail || !EMAIL_RE.test(finalEmail)) return { ok: false as const, error: "email" };
  if (await db.user.findUnique({ where: { email: finalEmail } })) return { ok: false as const, error: "email_taken" };

  try {
    const user = await db.user.create({ data: { phone: t.phone, email: finalEmail, name: n, locale: t.locale, privacyConsentAt: new Date() } });
    const role = await linkMasterRole(t.phone, user.id, user.role);
    await createSession(user.id);
    return { ok: true as const, role };
  } catch {
    // Гонка: тот же номер успел зарегистрироваться другим способом, пока заполняли имя/email
    return { ok: false as const, error: "exists" };
  }
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
