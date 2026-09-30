"use server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { getCurrentUser } from "../auth";
import {
  ANON_CART_COOKIE,
  upsertCartItem,
  removeCartItem,
  clearCartItems,
  resolveCartEntry,
} from "../services/cart";
import type { CartEntry } from "@/lib/cart";

// ─── Хелпер: анонимный ID корзины из cookie ──────────────────────────────

async function getOrCreateAnonId(): Promise<string> {
  const c = await cookies();
  const existing = c.get(ANON_CART_COOKIE)?.value;
  if (existing) return existing;
  const newId = crypto.randomBytes(16).toString("base64url");
  c.set(ANON_CART_COOKIE, newId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return newId;
}

async function getAnonId(): Promise<string | null> {
  return (await cookies()).get(ANON_CART_COOKIE)?.value ?? null;
}

// ─── Server Actions ───────────────────────────────────────────────────────

/** Добавить или обновить услугу в корзине; возвращает обновлённый снимок */
export async function addToCartAction(
  serviceId: string,
  optionIds: string[],
  planId: string | null,
): Promise<CartEntry | null> {
  const user = await getCurrentUser();
  if (user) {
    await upsertCartItem({ userId: user.id }, serviceId, optionIds, planId);
    return resolveCartEntry({ userId: user.id });
  }
  const anonId = await getOrCreateAnonId();
  await upsertCartItem({ anonId }, serviceId, optionIds, planId);
  return resolveCartEntry({ anonId });
}

/** Удалить позицию из корзины; возвращает обновлённый снимок */
export async function removeFromCartAction(itemId: string): Promise<CartEntry | null> {
  const user = await getCurrentUser();
  if (user) {
    await removeCartItem({ userId: user.id }, itemId);
    return resolveCartEntry({ userId: user.id });
  }
  const anonId = await getAnonId();
  if (anonId) {
    await removeCartItem({ anonId }, itemId);
    return resolveCartEntry({ anonId });
  }
  return null;
}

/** Очистить корзину (вызывается после создания заказа) */
export async function clearCartAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await clearCartItems({ userId: user.id });
    return;
  }
  const anonId = await getAnonId();
  if (anonId) await clearCartItems({ anonId });
}

/** Получить текущий снимок корзины для синхронизации с localStorage */
export async function getCartAction(): Promise<CartEntry | null> {
  const user = await getCurrentUser();
  if (user) return resolveCartEntry({ userId: user.id });
  const anonId = await getAnonId();
  if (!anonId) return null;
  return resolveCartEntry({ anonId });
}
