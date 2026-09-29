export type CartEntry = {
  slug: string;
  opts: string[];
  planId: string | null;
  count: number;
  total: number;
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
