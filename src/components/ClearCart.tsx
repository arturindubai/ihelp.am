"use client";
import { useEffect } from "react";
import { clearCart } from "@/lib/cart";
import { clearCartAction } from "@/server/actions/cart";

// После успешного заказа очищает корзину — и в localStorage, и на сервере
export function ClearCart() {
  useEffect(() => {
    clearCart();
    clearCartAction().catch(() => null);
  }, []);
  return null;
}
