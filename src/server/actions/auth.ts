"use server";
import { headers } from "next/headers";
import type { OtpChannel } from "@prisma/client";
import { db } from "../db";
import { normalizePhone } from "@/lib/phone";
import { normalizeEmail } from "@/lib/email";
import { sendOtp, verifyOtp } from "../otp";
import { createSession, getCurrentUser, hash, logout } from "../auth";
import { audit } from "../audit";
import { packSignupTicket, unpackSignupTicket } from "@/lib/signupTicket";

const secret = () => process.env.SESSION_SECRET || "dev";

export async function sendCodeAction(phoneRaw: string, channel: OtpChannel, locale = "ru") {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { ok: false as const, error: "phone" };
  // Код на email отправляется по адресу отдельным действием (sendEmailLoginCodeAction), не по номеру
  if (channel === "EMAIL") return { ok: false as const, error: "channel_unavailable" };
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
  // Новый номер (AUTH-11): аккаунт пока не создаём — номер подтверждён кодом, дальше имя и email, подтверждённый кодом
  // из письма (finishSignupAction). Так у каждого аккаунта и телефон, и почта подтверждены.
  if (!user) {
    const ticket = packSignupTicket({ phone, locale: ["ru", "en", "am"].includes(locale) ? locale : "ru" }, secret());
    return { ok: true as const, needSignup: true, signupTicket: ticket, phone, role: "CLIENT" } as const;
  }
  // Код запрошен из формы с уведомлением о политике конфиденциальности — фиксируем дату согласия
  if (!user.privacyConsentAt) user = await db.user.update({ where: { id: user.id }, data: { privacyConsentAt: new Date() } });
  // Если номер привязан к мастеру — выдаём роль мастера
  user = await linkMasterRole(user);
  // Редкий случай — существующий пользователь без имени (старые данные): спрашиваем имя, сессию создаём после
  if (!user.name) {
    const exp = Date.now() + 10 * 60_000;
    return { ok: true as const, needName: true, ticket: `${user.id}.${exp}.${hash(`${user.id}.${exp}`)}`, role: user.role } as const;
  }
  await createSession(user.id);
  return { ok: true as const, needName: false, role: user.role } as const;
}

/** Номер привязан к мастеру без аккаунта — выдаём роль мастера */
async function linkMasterRole<U extends { id: string; phone: string; role: string }>(user: U): Promise<U> {
  if (user.role !== "CLIENT") return user;
  const m = await db.master.findFirst({ where: { phone: user.phone, userId: null } });
  if (!m) return user;
  await db.master.update({ where: { id: m.id }, data: { userId: user.id } });
  return (await db.user.update({ where: { id: user.id }, data: { role: "MASTER" } })) as unknown as U;
}

/**
 * Пользователь, чей email подтверждён кодом (AUTH-14). Только по такому адресу пускаем в аккаунт:
 * иначе можно вписать в профиль чужую почту и перехватить вход её владельца. Если адрес почему-то у двух
 * аккаунтов сразу (до уникальности email) — не пускаем никого.
 */
async function verifiedUserByEmail(email: string) {
  const list = await db.user.findMany({ where: { email: { equals: email, mode: "insensitive" }, emailVerifiedAt: { not: null } }, take: 2 });
  return list.length === 1 ? list[0] : null;
}

/**
 * Код входа на email. Ответ одинаков для существующего, неизвестного, неподтверждённого и заблокированного
 * адреса: код и лимиты создаются всегда, письмо уходит только настоящему подтверждённому аккаунту.
 */
export async function sendEmailLoginCodeAction(emailRaw: string, locale = "ru") {
  const email = normalizeEmail(emailRaw);
  if (!email) return { ok: false as const, error: "email" };
  const user = await verifiedUserByEmail(email);
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
  const r = await sendOtp(email, "EMAIL", ip, ["ru", "en", "am"].includes(locale) ? locale : "ru", { skipDelivery: !user || user.blocked });
  return { ...r, email };
}

export async function verifyEmailLoginCodeAction(emailRaw: string, code: string) {
  const email = normalizeEmail(emailRaw);
  if (!email || !/^\d{4,6}$/.test(code.trim())) return { ok: false as const, error: "code" };
  if (!(await verifyOtp(email, code))) return { ok: false as const, error: "code" };
  const user = await verifiedUserByEmail(email);
  if (!user || user.blocked) return { ok: false as const, error: "code" };
  await createSession(user.id);
  await audit(user.id, "auth.email", "User", user.id);
  return { ok: true as const, role: user.role };
}

/**
 * Шаг 1 завершения регистрации: имя и email, на email уходит код. Номер уже подтверждён (тикет).
 * Занятый адрес отклоняем сразу — иначе человек введёт код и узнает об этом в конце.
 */
export async function startSignupEmailAction(ticket: string, nameRaw: string, emailRaw: string, locale = "ru") {
  const t = unpackSignupTicket(ticket, secret());
  if (!t) return { ok: false as const, error: "ticket" };
  const name = nameRaw.trim().slice(0, 80);
  if (!name) return { ok: false as const, error: "name" };
  const email = normalizeEmail(emailRaw);
  if (!email) return { ok: false as const, error: "email" };
  if (await db.user.findUnique({ where: { phone: t.phone } })) return { ok: false as const, error: "exists" };
  if (await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } })) return { ok: false as const, error: "email_taken" };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
  const r = await sendOtp(email, "EMAIL", ip, ["ru", "en", "am"].includes(locale) ? locale : t.locale);
  return { ...r, email };
}

/** Шаг 2: код из письма подтвердил email — создаём аккаунт с подтверждёнными номером и почтой и входим */
export async function finishSignupAction(ticket: string, nameRaw: string, emailRaw: string, code: string) {
  const t = unpackSignupTicket(ticket, secret());
  if (!t) return { ok: false as const, error: "ticket" };
  const name = nameRaw.trim().slice(0, 80);
  const email = normalizeEmail(emailRaw);
  if (!name || !email) return { ok: false as const, error: name ? "email" : "name" };
  if (!/^\d{4,6}$/.test(code.trim()) || !(await verifyOtp(email, code))) return { ok: false as const, error: "code" };
  try {
    const now = new Date();
    const created = await db.user.create({ data: { phone: t.phone, email, emailVerifiedAt: now, name, locale: t.locale, privacyConsentAt: now } });
    const user = await linkMasterRole(created);
    await createSession(user.id);
    await audit(user.id, "auth.signup", "User", user.id);
    return { ok: true as const, role: user.role };
  } catch {
    // Гонка: тот же номер или email успели занять, пока вводили код
    return { ok: false as const, error: "exists" };
  }
}

export async function completeSignupAction(ticket: string, name: string) {
  const [id, exp, sig] = (ticket || "").split(".");
  if (!id || !exp || Number(exp) < Date.now() || sig !== hash(`${id}.${exp}`)) return { ok: false };
  const n = name.trim().slice(0, 80);
  if (!n) return { ok: false };
  try {
    await db.user.update({ where: { id }, data: { name: n } });
  } catch {
    // билет регистрации нового номера имеет тот же вид и подпись, но id пользователя в нём нет — не падаем
    return { ok: false };
  }
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
