import "server-only";
import crypto from "crypto";
import { cookies, headers } from "next/headers";
import { db } from "./db";
import { getSettings } from "./settings";
import { sessionDays } from "@/lib/sessionDays";
import { ANON_CART_COOKIE, mergeAnonCartIntoUser } from "./services/cart";
import type { Role, User } from "@prisma/client";

const COOKIE = "sid";

export const hash = (v: string) => crypto.createHmac("sha256", process.env.SESSION_SECRET || "dev").update(v).digest("hex");

export async function createSession(userId: string, role?: string) {
  const s = await getSettings().catch(() => null);
  const days = sessionDays(role, s?.auth.staffSessionDays ?? 7, s?.auth.clientSessionDays ?? 60);
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + days * 86400_000);
  const ua = (await headers()).get("user-agent")?.slice(0, 200);
  await db.session.create({ data: { tokenHash: hash(token), userId, expiresAt, userAgent: ua } });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });

  const c = await cookies();

  // Слить анонимную корзину в корзину пользователя при входе (FLOW-3)
  const anonId = c.get(ANON_CART_COOKIE)?.value;
  if (anonId) {
    await mergeAnonCartIntoUser(anonId, userId).catch(() => null);
    c.delete(ANON_CART_COOKIE);
  }

  c.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  });
}

export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || s.user.blocked) return null;
  return s.user;
}

/**
 * endpoint — адрес push-подписки этого браузера. Если передан — удаляем только её.
 * Не передан — подписки не трогаем: иначе выход с компьютера лишит мастера уведомлений на телефоне.
 */
export async function logout(endpoint?: string) {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (token) {
    if (endpoint) {
      await db.pushSubscription.deleteMany({ where: { endpoint } });
    }
    await db.session.deleteMany({ where: { tokenHash: hash(token) } });
  }
  c.delete(COOKIE);
}

export const STAFF_ROLES: Role[] = ["OPERATOR", "ADMIN", "OWNER"];
export const ADMIN_ROLES: Role[] = ["ADMIN", "OWNER"];

export class AuthError extends Error {}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) throw new AuthError("unauthorized");
  return u;
}

export async function requireRole(roles: Role[]) {
  const u = await requireUser();
  if (!roles.includes(u.role)) throw new AuthError("forbidden");
  return u;
}
