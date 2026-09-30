"use client";
import { useEffect } from "react";
import { clearCart } from "@/lib/cart";

// Очищает localStorage-корзину при монтировании — вызывается на странице успеха заказа
export function ClearCart() {
  useEffect(() => {
    clearCart();
  }, []);
  return null;
}
