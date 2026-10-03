"use client";
import { useEffect } from "react";
import { writeCart, clearCart } from "@/lib/cart";
import { getCartAction } from "@/server/actions/cart";

// После успешного заказа синхронизирует localStorage с сервером:
// сервер уже убрал заказанную услугу, остальные позиции сохранены
export function ClearCart() {
  useEffect(() => {
    getCartAction()
      .then((entry) => {
        if (entry) writeCart(entry);
        else clearCart();
      })
      .catch(() => null);
  }, []);
  return null;
}
