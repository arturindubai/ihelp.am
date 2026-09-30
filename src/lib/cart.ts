import { calculatePrice, type PriceLine, type PricePlan, type PricingRules } from "./pricing";

// ─── Клиентский снимок корзины для localStorage ───────────────────────────

export type CartEntry = {
  slug: string;        // slug первой услуги (для ссылки StickyCartBar)
  opts: string[];      // optionIds первой услуги
  planId: string | null;
  count: number;       // число услуг в корзине (не опций)
  total: number;       // итоговая сумма по всем услугам
};

const CART_KEY = "ihelp_cart";
export const CART_EVENT = "ihelp:cart";

export function readCart(): CartEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CartEntry) : null;
  } catch {
    return null;
  }
}

export function writeCart(entry: CartEntry): void {
  localStorage.setItem(CART_KEY, JSON.stringify(entry));
  window.dispatchEvent(new Event(CART_EVENT));
}

export function clearCart(): void {
  localStorage.removeItem(CART_KEY);
  window.dispatchEvent(new Event(CART_EVENT));
}

// ─── Типы для серверной корзины (без DB-зависимости) ─────────────────────

/** Позиция корзины — передаётся между клиентом и сервером без Prisma-типов */
export interface CartItemInput {
  serviceId: string;
  optionIds: string[];
  planId: string | null;
  qty: number;
}

/**
 * Слияние анонимной корзины с корзиной пользователя.
 * Элементы из anonItems, которых нет в userItems (по serviceId), добавляются в конец.
 * userItems имеют приоритет (версия пользователя не перезаписывается).
 */
export function mergeCartItems(
  anonItems: CartItemInput[],
  userItems: CartItemInput[],
): CartItemInput[] {
  const userServiceIds = new Set(userItems.map((i) => i.serviceId));
  const toAdd = anonItems.filter((i) => !userServiceIds.has(i.serviceId));
  return [...userItems, ...toAdd];
}

// ─── Расчёт стоимости корзины (чистая функция, без DB) ────────────────────

/** Позиция с уже разрешёнными строками цен (для расчёта без обращения к DB) */
export interface CartItemForCalc {
  serviceId: string;
  lines: PriceLine[];
  plan?: PricePlan | null;
  qty: number;
}

export interface CartItemTotal {
  serviceId: string;
  payNow: number;
  savings: number;
  savingsPercent: number;
}

export interface CartTotals {
  items: CartItemTotal[];
  total: number;
  totalBase: number;
  totalSavings: number;
}

/**
 * Считает стоимость корзины без обращения к БД.
 * isFirstOrder применяется только к первой позиции (первый заказ = первая услуга в списке).
 */
export function calcCartTotals(
  items: CartItemForCalc[],
  isFirstOrder: boolean,
  rules?: Partial<PricingRules>,
): CartTotals {
  const resolved: CartItemTotal[] = items.map((item, idx) => {
    const r = calculatePrice({
      lines: item.lines,
      plan: item.plan,
      isFirstOrder: idx === 0 ? isFirstOrder : false,
      rules,
    });
    const itemPayNow = r.payNow * item.qty;
    const itemBase = r.payNowBase * item.qty;
    return {
      serviceId: item.serviceId,
      payNow: itemPayNow,
      savings: itemBase - itemPayNow,
      savingsPercent: r.savingsPercent,
    };
  });

  const total = resolved.reduce((s, x) => s + x.payNow, 0);
  const totalBase = resolved.reduce((s, x) => s + x.payNow + x.savings, 0);
  const totalSavings = totalBase - total;

  return { items: resolved, total, totalBase, totalSavings };
}
