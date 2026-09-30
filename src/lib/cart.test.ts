import { describe, it, expect, beforeEach, vi } from "vitest";
import { CART_EVENT, type CartEntry } from "./cart";

const SAMPLE: CartEntry = { slug: "cleaning", opts: ["opt1", "opt2"], planId: null, count: 1, total: 5000, slugs: ["cleaning"] };

// Простой localStorage-стаб для тестирования без браузерного окружения
function makeLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
}

beforeEach(() => {
  const ls = makeLocalStorage();
  vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("window", { localStorage: ls, dispatchEvent: vi.fn() });
});

describe("cart storage", () => {
  it("readCart возвращает null при пустом хранилище", async () => {
    const { readCart } = await import("./cart");
    expect(readCart()).toBeNull();
  });

  it("writeCart сохраняет и readCart возвращает", async () => {
    const { readCart, writeCart } = await import("./cart");
    writeCart(SAMPLE);
    expect(readCart()).toEqual(SAMPLE);
  });

  it("clearCart удаляет запись", async () => {
    const { readCart, writeCart, clearCart } = await import("./cart");
    writeCart(SAMPLE);
    clearCart();
    expect(readCart()).toBeNull();
  });

  it("writeCart диспатчит событие через window.dispatchEvent", async () => {
    const { writeCart } = await import("./cart");
    writeCart(SAMPLE);
    expect((window as unknown as { dispatchEvent: ReturnType<typeof vi.fn> }).dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: CART_EVENT }),
    );
  });

  it("после успешного заказа clearCart очищает корзину и диспатчит событие", async () => {
    const { readCart, writeCart, clearCart } = await import("./cart");
    writeCart(SAMPLE);
    clearCart();
    expect(readCart()).toBeNull();
    expect((window as unknown as { dispatchEvent: ReturnType<typeof vi.fn> }).dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: CART_EVENT }),
    );
  });

  it("writeCart сохраняет count=1 при любом количестве опций", async () => {
    const { readCart, writeCart } = await import("./cart");
    writeCart({ ...SAMPLE, count: 1 });
    expect(readCart()?.count).toBe(1);
  });
});

// ─── mergeCartItems ───────────────────────────────────────────────────────

describe("mergeCartItems", () => {
  const item1 = { serviceId: "svc-1", optionIds: ["o1"], planId: null, qty: 1 };
  const item2 = { serviceId: "svc-2", optionIds: ["o2"], planId: "plan-a", qty: 1 };
  const item3 = { serviceId: "svc-3", optionIds: ["o3"], planId: null, qty: 1 };

  it("пустая anon-корзина → возвращает копию корзины пользователя", async () => {
    const { mergeCartItems } = await import("./cart");
    expect(mergeCartItems([], [item1])).toEqual([item1]);
  });

  it("пустая корзина пользователя → все элементы из anon добавляются", async () => {
    const { mergeCartItems } = await import("./cart");
    expect(mergeCartItems([item1, item2], [])).toEqual([item1, item2]);
  });

  it("услуга из anon-корзины, которой нет у пользователя, добавляется в конец", async () => {
    const { mergeCartItems } = await import("./cart");
    const result = mergeCartItems([item3], [item1, item2]);
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual(item3);
  });

  it("услуга из anon-корзины, которая уже есть у пользователя, не перезаписывает user-версию", async () => {
    const { mergeCartItems } = await import("./cart");
    const anonVersion = { ...item1, optionIds: ["o1-new"] };
    const result = mergeCartItems([anonVersion], [item1]);
    expect(result).toHaveLength(1);
    // user-версия не затронута
    expect(result[0].optionIds).toEqual(["o1"]);
  });

  it("обе корзины пустые → пустой результат", async () => {
    const { mergeCartItems } = await import("./cart");
    expect(mergeCartItems([], [])).toEqual([]);
  });

  it("порядок: сначала элементы пользователя, потом новые из anon", async () => {
    const { mergeCartItems } = await import("./cart");
    // user: [item2]; anon: [item3, item1] — оба не в user-корзине, добавляются в порядке anon
    const result = mergeCartItems([item3, item1], [item2]);
    expect(result.map((x) => x.serviceId)).toEqual(["svc-2", "svc-3", "svc-1"]);
  });
});

// ─── calcCartTotals ───────────────────────────────────────────────────────

describe("calcCartTotals", () => {
  const line = (price: number, discountable = true) => ({
    groupTitle: "d",
    optionTitle: "o",
    price,
    discountable,
    durationMin: 60,
  });

  it("одна услуга без скидок → total равен цене", async () => {
    const { calcCartTotals } = await import("./cart");
    const result = calcCartTotals(
      [{ serviceId: "s1", lines: [line(9000)], qty: 1 }],
      false,
    );
    expect(result.total).toBe(9000);
    expect(result.items[0].payNow).toBe(9000);
    expect(result.items[0].savings).toBe(0);
  });

  it("две услуги → total суммируется", async () => {
    const { calcCartTotals } = await import("./cart");
    const result = calcCartTotals(
      [
        { serviceId: "s1", lines: [line(9000)], qty: 1 },
        { serviceId: "s2", lines: [line(5000)], qty: 1 },
      ],
      false,
    );
    expect(result.total).toBe(14000);
  });

  it("isFirstOrder применяется только к первой позиции (скидка 10%)", async () => {
    const { calcCartTotals } = await import("./cart");
    const result = calcCartTotals(
      [
        { serviceId: "s1", lines: [line(10000)], qty: 1 },
        { serviceId: "s2", lines: [line(10000)], qty: 1 },
      ],
      true,
    );
    // первая позиция: 10000 * 0.9 = 9000
    expect(result.items[0].payNow).toBe(9000);
    // вторая позиция: без скидки первого заказа
    expect(result.items[1].payNow).toBe(10000);
    expect(result.total).toBe(19000);
  });

  it("qty > 1 умножает стоимость позиции", async () => {
    const { calcCartTotals } = await import("./cart");
    const result = calcCartTotals(
      [{ serviceId: "s1", lines: [line(5000)], qty: 2 }],
      false,
    );
    expect(result.items[0].payNow).toBe(10000);
    expect(result.total).toBe(10000);
  });

  it("totalSavings = totalBase - total", async () => {
    const { calcCartTotals } = await import("./cart");
    const result = calcCartTotals(
      [{ serviceId: "s1", lines: [line(10000)], qty: 1 }],
      true,
    );
    expect(result.totalSavings).toBe(result.totalBase - result.total);
    expect(result.totalSavings).toBeGreaterThan(0);
  });

  it("недисконтируемые строки (материалы) не дают скидку", async () => {
    const { calcCartTotals } = await import("./cart");
    const result = calcCartTotals(
      [{ serviceId: "s1", lines: [line(9000), line(1000, false)], qty: 1 }],
      true,
    );
    // скидка 10% только на 9000: 900; материалы 1000 без скидки
    expect(result.items[0].payNow).toBe(9000 - 900 + 1000);
  });
});
