"use client";
import { useEffect, useState, useTransition } from "react";
import { readCart, writeCart, clearCart, CART_EVENT } from "@/lib/cart";
import { addServiceDefaultsToCartAction, removeServiceFromCartAction } from "@/server/actions/cart";

type Props = {
  serviceId: string;
  slug: string;
  label: string;
  className?: string;
};

export function CartAddButton({ serviceId, slug, label, className = "" }: Props) {
  const [inCart, setInCart] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function sync() {
      const cart = readCart();
      const slugs: string[] = cart?.slugs ?? (cart?.slug ? [cart.slug] : []);
      setInCart(slugs.includes(slug));
    }
    sync();
    window.addEventListener(CART_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CART_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [slug]);

  function handleAdd() {
    if (inCart) return;
    setInCart(true);
    startTransition(async () => {
      const entry = await addServiceDefaultsToCartAction(serviceId);
      if (entry) writeCart(entry);
      else setInCart(false);
    });
  }

  function handleRemove() {
    setInCart(false);
    startTransition(async () => {
      const entry = await removeServiceFromCartAction(serviceId);
      if (entry) writeCart(entry);
      else clearCart();
    });
  }

  return (
    <button
      onClick={inCart ? handleRemove : handleAdd}
      disabled={pending}
      className={`${className} transition disabled:opacity-60`}
    >
      {inCart ? "✓" : label}
    </button>
  );
}
