"use client";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { readCart, CART_EVENT } from "@/lib/cart";

type Props = { label: string };

export function StickyOrderButton({ label }: Props) {
  const [visible, setVisible] = useState(true);
  const [hasCart, setHasCart] = useState(false);

  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer) return;
    const io = new IntersectionObserver(([e]) => setVisible(!e.isIntersecting), { threshold: 0 });
    io.observe(footer);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const sync = () => setHasCart(!!readCart());
    sync();
    window.addEventListener(CART_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CART_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Когда видна плашка корзины (bottom-20 + ~60px высоты), поднимаем кнопку выше
  const bottomClass = hasCart ? "bottom-40" : "bottom-24";

  return (
    <div
      className={`fixed inset-x-4 ${bottomClass} z-30 transition-all duration-200 md:hidden ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <Link href="/services" className="btn-primary flex w-full items-center justify-center py-3 text-base font-semibold shadow-lg">
        {label}
      </Link>
    </div>
  );
}
