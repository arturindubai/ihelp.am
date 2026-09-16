"use client";
import { Home, LayoutGrid, CalendarDays, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const HIDE = [/^\/s\//, /^\/book\//, /^\/login/];

export function BottomNav() {
  const t = useTranslations("nav");
  const path = usePathname();
  if (HIDE.some((r) => r.test(path))) return null;
  const items = [
    { href: "/", icon: Home, label: t("home"), active: path === "/" },
    { href: "/services", icon: LayoutGrid, label: t("services"), active: path.startsWith("/services") || path.startsWith("/c/") },
    { href: "/account/orders", icon: CalendarDays, label: t("bookings"), active: path.startsWith("/account/orders") },
    { href: "/account", icon: User, label: t("account"), active: path === "/account" },
  ];
  return (
    <>
      <div className="h-20 md:hidden" />
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-[560px] grid-cols-4">
          {items.map((i) => (
            <Link key={i.href} href={i.href} className={`flex flex-col items-center gap-0.5 pt-2 text-[11px] font-medium ${i.active ? "text-brand" : "text-muted"}`}>
              <i.icon size={22} strokeWidth={i.active ? 2.4 : 1.8} />
              {i.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
