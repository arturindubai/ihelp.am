import { describe, it, expect, beforeEach, vi } from "vitest";
import { CART_EVENT, type CartEntry } from "./cart";

const SAMPLE: CartEntry = { slug: "cleaning", opts: ["opt1", "opt2"], planId: null, count: 2, total: 5000 };

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
});
