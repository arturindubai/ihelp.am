"use client";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { readCart, writeCart, clearCart, CART_EVENT, type CartEntry } from "@/lib/cart";
import { addServiceDefaultsToCartAction, removeServiceFromCartAction } from "@/server/actions/cart";

type Props = {
  slug: string;
  serviceId: string;
  /** className для корневого элемента (передаётся снаружи для позиционирования) */
  className?: string;
};

export function AddToCartButton({ slug, serviceId, className = "" }: Props) {
  const t = useTranslations("service");
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

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setInCart(true);
    startTransition(async () => {
      const entry = await addServiceDefaultsToCartAction(serviceId);
      if (entry) writeCart(entry);
      else setInCart(false);
    });
  }

  function handleRemove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setInCart(false);
    startTransition(async () => {
      const entry = await removeServiceFromCartAction(serviceId);
      if (entry) writeCart(entry);
      else clearCart();
    });
  }

  if (!inCart) {
    return (
      <button
        onClick={handleAdd}
        disabled={pending}
        className={`border border-brand text-brand rounded-xl px-3 py-1.5 text-sm font-medium hover:bg-brand-50 transition disabled:opacity-60 ${className}`}
        aria-label={t("addToCart")}
      >
        {t("addToCart")}
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-2 border border-line rounded-xl px-2 py-1.5 ${className}`}>
      <button
        onClick={handleRemove}
        disabled={pending}
        className="size-7 rounded-lg bg-surface flex items-center justify-center text-lg leading-none font-semibold text-ink hover:bg-line transition disabled:opacity-60"
        aria-label="−"
      >
        −
      </button>
      <span className="min-w-[20px] text-center font-semibold text-sm">1</span>
      <button
        onClick={handleAdd}
        disabled={pending}
        className="size-7 rounded-lg bg-surface flex items-center justify-center text-lg leading-none font-semibold text-ink hover:bg-line transition disabled:opacity-60"
        aria-label="+"
      >
        +
      </button>
    </div>
  );
}
