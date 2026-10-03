import "server-only";
import type { Cart } from "@prisma/client";
import { db } from "../db";
import { calculatePrice } from "@/lib/pricing";
import type { PricingRules } from "@/lib/pricing";
import { tr } from "@/i18n/locales";
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

/** Удалить позицию из корзины по id CartItem */
export async function removeCartItem(selector: CartSelector, itemId: string): Promise<void> {
  const cart = await db.cart.findUnique({ where: selector });
  if (!cart) return;
  await db.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
}

/** Удалить позицию из корзины по serviceId */
export async function removeCartItemByService(selector: CartSelector, serviceId: string): Promise<void> {
  const cart = await db.cart.findUnique({ where: selector });
  if (!cart) return;
  await db.cartItem.deleteMany({ where: { serviceId, cartId: cart.id } });
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

  const slugs = cart.items.map((i) => serviceMap.get(i.serviceId)?.slug ?? "").filter(Boolean);

  return {
    slug: firstService.slug,
    opts: first.optionIds as string[],
    planId: first.planId,
    count: cart.items.length,
    total,
    slugs,
  };
}

// ─── Детали корзины для страницы /cart ────────────────────────────────────

export interface CartItemDetail {
  cartItemId: string;
  serviceId: string;
  slug: string;
  title: string;
  image: string | null;
  optionSummary: string;
  optionIds: string[];
  planId: string | null;
  price: number;
  basePrice: number;
  qty: number;
  bookHref: string;
}

export interface CrossSellItem {
  id: string;
  slug: string;
  title: string;
  image: string | null;
  fromPrice: number;
}

export interface CartDetails {
  items: CartItemDetail[];
  total: number;
  totalBase: number;
  savings: number;
  firstSlug: string | null;
  firstOpts: string[];
  firstPlanId: string | null;
  crossSells: CrossSellItem[];
}

export async function getCartDetails(
  selector: CartSelector,
  locale: string,
  isFirstOrder: boolean,
  rules: PricingRules,
): Promise<CartDetails | null> {
  const cart = await db.cart.findUnique({
    where: selector,
    include: { items: { orderBy: { createdAt: "asc" } } },
  });

  if (!cart || cart.items.length === 0) return null;

  const serviceIds = [...new Set(cart.items.map((i) => i.serviceId))];

  const services = await db.service.findMany({
    where: { id: { in: serviceIds } },
    select: {
      id: true,
      slug: true,
      title: true,
      image: true,
      groups: {
        where: { active: true },
        orderBy: { sort: "asc" },
        select: {
          type: true,
          options: {
            where: { active: true },
            select: { id: true, title: true, price: true, discountable: true, durationMin: true },
          },
        },
      },
      plans: {
        where: { active: true },
        select: { id: true, kind: true, discountPercent: true, packageVisits: true },
      },
    },
  });

  const planIds = cart.items.map((i) => i.planId).filter(Boolean) as string[];
  const plans = planIds.length
    ? await db.plan.findMany({
        where: { id: { in: planIds } },
        select: { id: true, kind: true, discountPercent: true, packageVisits: true },
      })
    : [];

  const serviceMap = new Map(services.map((s) => [s.id, s]));
  const planMap = new Map(plans.map((p) => [p.id, p]));

  const items: CartItemDetail[] = [];
  let total = 0;
  let totalBase = 0;

  for (const item of cart.items) {
    const svc = serviceMap.get(item.serviceId);
    if (!svc) continue;

    const allOptions = svc.groups.flatMap((g) => g.options);
    const optionIds = item.optionIds as string[];
    const selectedOptions = allOptions.filter((o) => optionIds.includes(o.id));

    const lines = selectedOptions.map((o) => ({
      groupTitle: "",
      optionTitle: tr(o.title, locale) as string,
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
      isFirstOrder: items.length === 0 ? isFirstOrder : false,
      rules,
    });

    const itemPrice = pr.payNow * item.qty;
    const itemBase = pr.payNowBase * item.qty;
    total += itemPrice;
    totalBase += itemBase;

    const optionSummary = selectedOptions
      .map((o) => tr(o.title, locale) as string)
      .filter(Boolean)
      .join(" · ");

    const opts = (item.optionIds as string[]).join(",");
    const bookHref = `/book/${svc.slug}?o=${opts}${item.planId ? `&p=${item.planId}` : ""}`;

    items.push({
      cartItemId: item.id,
      serviceId: item.serviceId,
      slug: svc.slug,
      title: tr(svc.title, locale) as string,
      image: svc.image,
      optionSummary,
      optionIds: item.optionIds as string[],
      planId: item.planId,
      price: itemPrice,
      basePrice: itemBase,
      qty: item.qty,
      bookHref,
    });
  }

  if (items.length === 0) return null;

  // Смежные услуги для cross-sell: активные, не в корзине, до 6 штук
  const crossSellSvcs = await db.service.findMany({
    where: { active: true, comingSoon: false, id: { notIn: serviceIds } },
    orderBy: { bookingsCount: "desc" },
    take: 6,
    select: {
      id: true,
      slug: true,
      title: true,
      image: true,
      groups: {
        where: { active: true },
        select: { options: { where: { active: true }, select: { price: true } } },
      },
    },
  });

  const crossSells: CrossSellItem[] = crossSellSvcs.map((s) => {
    const prices = s.groups.flatMap((g) => g.options.map((o) => o.price)).filter((p) => p > 0);
    return {
      id: s.id,
      slug: s.slug,
      title: tr(s.title, locale) as string,
      image: s.image,
      fromPrice: prices.length ? Math.min(...prices) : 0,
    };
  });

  const first = cart.items[0];

  return {
    items,
    total,
    totalBase,
    savings: totalBase - total,
    firstSlug: items[0]?.slug ?? null,
    firstOpts: first.optionIds as string[],
    firstPlanId: first.planId,
    crossSells,
  };
}
