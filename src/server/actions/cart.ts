"use server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { getCurrentUser } from "../auth";
import { db } from "../db";
import {
  ANON_CART_COOKIE,
  upsertCartItem,
  removeCartItem,
  removeCartItemByService,
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

/** Удалить услугу из корзины по serviceId; возвращает обновлённый снимок */
export async function removeServiceFromCartAction(serviceId: string): Promise<CartEntry | null> {
  const user = await getCurrentUser();
  if (user) {
    await removeCartItemByService({ userId: user.id }, serviceId);
    return resolveCartEntry({ userId: user.id });
  }
  const anonId = await getAnonId();
  if (anonId) {
    await removeCartItemByService({ anonId }, serviceId);
    return resolveCartEntry({ anonId });
  }
  return null;
}

/** Добавить услугу с дефолтными опциями (для кнопки «+ Добавить» в каталоге) */
export async function addServiceDefaultsToCartAction(serviceId: string): Promise<CartEntry | null> {
  const svc = await db.service.findUnique({
    where: { id: serviceId },
    include: {
      groups: {
        where: { active: true },
        orderBy: { sort: "asc" },
        include: { options: { where: { active: true }, orderBy: { sort: "asc" } } },
      },
      plans: { where: { active: true }, orderBy: { sort: "asc" } },
    },
  });
  if (!svc) return null;

  const opts: string[] = [];
  for (const g of svc.groups) {
    const d = g.options.filter((o) => o.isDefault);
    if (g.type === "SINGLE") {
      const pick = d[0] ?? (g.required ? g.options[0] : undefined);
      if (pick) opts.push(pick.id);
    } else {
      opts.push(...d.map((o) => o.id));
    }
  }
  const plan = svc.plans.find((p) => p.isDefault) ?? svc.plans[0] ?? null;
  const planId = plan?.id ?? null;

  return addToCartAction(serviceId, opts, planId);
}
