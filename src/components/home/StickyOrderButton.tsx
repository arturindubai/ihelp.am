"use client";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";

type Props = { label: string };

export function StickyOrderButton({ label }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer) return;
    const io = new IntersectionObserver(([e]) => setVisible(!e.isIntersecting), { threshold: 0 });
    io.observe(footer);
    return () => io.disconnect();
  }, []);

  return (
    <div
      className={`fixed inset-x-4 bottom-24 z-30 transition-opacity duration-200 md:hidden ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <Link href="/services" className="btn-primary flex w-full items-center justify-center py-3 text-base font-semibold shadow-lg">
        {label}
      </Link>
    </div>
  );
}
