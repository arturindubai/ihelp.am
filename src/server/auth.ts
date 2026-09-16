import "server-only";
import crypto from "crypto";
import { cookies, headers } from "next/headers";
import { db } from "./db";
import type { Role, User } from "@prisma/client";

const COOKIE = "sid";
const DAYS = 60;

export const hash = (v: string) => crypto.createHmac("sha256", process.env.SESSION_SECRET || "dev").update(v).digest("hex");

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + DAYS * 86400_000);
  const ua = (await headers()).get("user-agent")?.slice(0, 200);
  await db.session.create({ data: { tokenHash: hash(token), userId, expiresAt, userAgent: ua } });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  (await cookies()).set(COOKIE, token, {
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

export async function logout() {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hash(token) } });
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
