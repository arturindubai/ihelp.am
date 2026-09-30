"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { readCart, CART_EVENT, type CartEntry } from "@/lib/cart";
import { amd } from "@/lib/format";

// Скрываем плашку там, где PriceBar уже показывает корзину или где оформление не нужно
const HIDE_ON = [/^\/book\//, /^\/s\//];

// Совпадает с HIDE в BottomNav — на этих путях BottomNav скрыт
const BOTTOM_NAV_HIDDEN = [/^\/s\//, /^\/book\//, /^\/login/];

export function StickyCartBar() {
  const [cart, setCart] = useState<CartEntry | null>(null);
  const [ready, setReady] = useState(false);
  const t = useTranslations("cart");
  const path = usePathname();

  useEffect(() => {
    setCart(readCart());
    setReady(true);
    const sync = () => setCart(readCart());
    window.addEventListener(CART_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CART_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Не рендерится пока данные не загружены (нет мерцания), корзина пуста или на запрещённых путях
  if (!ready || !cart || cart.count === 0) return null;
  if (HIDE_ON.some((r) => r.test(path))) return null;

  // Если BottomNav виден, сдвигаем плашку вверх чтобы не перекрывать навигацию
  const aboveNav = !BOTTOM_NAV_HIDDEN.some((r) => r.test(path));
  // Мобильный отступ снизу: над BottomNav или у самого низа
  const mobileBottom = aboveNav ? "bottom-20" : "bottom-0";

  const countLabel = cart.count > 99 ? "99+" : t("itemsCount", { count: cart.count });
  const bookHref = `/book/${cart.slug}?o=${cart.opts.join(",")}${cart.planId ? `&p=${cart.planId}` : ""}`;

  return (
    // Мобильно: полная ширина. Десктоп: компактно справа снизу
    <div className={`${aboveNav ? "" : "pb-safe"} fixed ${mobileBottom} inset-x-0 z-40 border-t border-line bg-paper shadow-[0_-2px_12px_rgba(0,0,0,0.08)] md:inset-x-auto md:left-auto md:right-4 md:bottom-4 md:w-72 md:rounded-2xl md:border md:shadow-lg`}>
      <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3 md:mx-0 md:max-w-none">
        <div className="flex-1">
          <div className="font-medium text-ink">{countLabel}</div>
          <div className="text-sm text-muted">{amd(cart.total)}</div>
        </div>
        <Link href={bookHref} className="btn-primary shrink-0">
          {t("checkout")}
        </Link>
      </div>
    </div>
  );
}
