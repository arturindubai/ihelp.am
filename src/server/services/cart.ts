import "server-only";
import type { Cart } from "@prisma/client";
import { db } from "../db";
import { calculatePrice } from "@/lib/pricing";
import type { CartEntry } from "@/lib/cart";

export const ANON_CART_COOKIE = "cart_anon";

// ─── Внутренние хелперы ───────────────────────────────────────────────────

type CartSelector = { userId: string } | { anonId: string };

async function getOrCreateCart(selector: CartSelector): Promise<Cart> {
  const existing = await db.cart.findUnique({ where: selector });
  if (existing) return existing;
  return db.cart.create({ data: { ...selector, updatedAt: new Date() } });
}

// ─── Публичное API сервиса ────────────────────────────────────────────────

/** Добавить или обновить услугу в корзине (upsert по serviceId) */
export async function upsertCartItem(
  selector: CartSelector,
  serviceId: string,
  optionIds: string[],
  planId: string | null,
): Promise<void> {
  const cart = await getOrCreateCart(selector);
  await db.cartItem.upsert({
    where: { cartId_serviceId: { cartId: cart.id, serviceId } },
    update: { optionIds, planId, updatedAt: new Date() },
    create: { cartId: cart.id, serviceId, optionIds, planId, qty: 1 },
  });
  await db.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
}

/** Удалить позицию из корзины */
export async function removeCartItem(selector: CartSelector, itemId: string): Promise<void> {
  const cart = await db.cart.findUnique({ where: selector });
  if (!cart) return;
  await db.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
}

/** Очистить все позиции корзины */
export async function clearCartItems(selector: CartSelector): Promise<void> {
  const cart = await db.cart.findUnique({ where: selector });
  if (!cart) return;
  await db.cartItem.deleteMany({ where: { cartId: cart.id } });
}

/**
 * Слияние анонимной корзины в корзину пользователя при входе.
 * Позиции из анонимной корзины добавляются, если у пользователя нет той же услуги.
 * После слияния анонимная корзина удаляется.
 */
export async function mergeAnonCartIntoUser(anonId: string, userId: string): Promise<void> {
  const anon = await db.cart.findUnique({ where: { anonId }, include: { items: true } });
  if (!anon || anon.items.length === 0) {
    if (anon) await db.cart.delete({ where: { id: anon.id } }).catch(() => null);
    return;
  }

  const userCart = await getOrCreateCart({ userId });
  const userItems = await db.cartItem.findMany({ where: { cartId: userCart.id } });
  const userServiceIds = new Set(userItems.map((i) => i.serviceId));

  for (const item of anon.items) {
    if (!userServiceIds.has(item.serviceId)) {
      await db.cartItem.create({
        data: {
          cartId: userCart.id,
          serviceId: item.serviceId,
          optionIds: item.optionIds,
          planId: item.planId,
          qty: item.qty,
        },
      });
    }
  }

  await db.cart.delete({ where: { id: anon.id } });
}

/**
 * Получить снимок корзины для localStorage (CartEntry).
 * Загружает цены опций и считает сумму на сервере через calculatePrice.
 */
export async function resolveCartEntry(selector: CartSelector): Promise<CartEntry | null> {
  const cart = await db.cart.findUnique({
    where: selector,
    include: { items: { orderBy: { createdAt: "asc" } } },
  });

  if (!cart || cart.items.length === 0) return null;

  // Загружаем все затронутые услуги с группами и опциями за один запрос
  const serviceIds = [...new Set(cart.items.map((i) => i.serviceId))];
  const services = await db.service.findMany({
    where: { id: { in: serviceIds } },
    select: {
      id: true,
      slug: true,
      groups: {
        where: { active: true },
        select: {
          options: {
            where: { active: true },
            select: { id: true, price: true, discountable: true, durationMin: true },
          },
        },
      },
    },
  });

  // Загружаем планы для позиций, у которых задан planId
  const planIds = cart.items.map((i) => i.planId).filter(Boolean) as string[];
  const plans = planIds.length
    ? await db.plan.findMany({
        where: { id: { in: planIds } },
        select: { id: true, kind: true, discountPercent: true, packageVisits: true },
      })
    : [];

  const serviceMap = new Map(services.map((s) => [s.id, s]));
  const planMap = new Map(plans.map((p) => [p.id, p]));

  let total = 0;
  const first = cart.items[0];

  for (const item of cart.items) {
    const svc = serviceMap.get(item.serviceId);
    if (!svc) continue;

    const allOptions = svc.groups.flatMap((g) => g.options);
    const optionIds = item.optionIds as string[];
    const lines = allOptions
      .filter((o) => optionIds.includes(o.id))
      .map((o) => ({
        groupTitle: "",
        optionTitle: "",
        price: o.price,
        discountable: o.discountable,
        durationMin: o.durationMin,
      }));

    if (lines.length === 0) continue;

    const plan = item.planId ? planMap.get(item.planId) : null;
    const pr = calculatePrice({
      lines,
      plan: plan
        ? { kind: plan.kind, discountPercent: plan.discountPercent, packageVisits: plan.packageVisits }
        : null,
    });
    total += pr.payNow * item.qty;
  }

  const firstService = serviceMap.get(first.serviceId);
  if (!firstService) return null;

  return {
    slug: firstService.slug,
    opts: first.optionIds as string[],
    planId: first.planId,
    count: cart.items.length,
    total,
  };
}
