"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Gauge, LayoutDashboard, ClipboardList, CalendarRange, Sparkles, UsersRound, Contact, Star, TicketPercent, Image, FileText, LayoutGrid, Languages, Settings, ShieldCheck, History, BarChart2, Wallet, Menu, X, ExternalLink } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/format";
import { Logo } from "@/components/Logo";

const ICONS = { control: Gauge, dashboard: LayoutDashboard, finance: Wallet, orders: ClipboardList, schedule: CalendarRange, services: Sparkles, masters: UsersRound, clients: Contact, reviews: Star, promos: TicketPercent, banners: Image, pages: FileText, content: LayoutGrid, translations: Languages, analytics: BarChart2, settings: Settings, staff: ShieldCheck, log: History };

const SERVICES_SUBS = [
  { key: "catalog", href: "/admin/services" },
  { key: "prices", href: "/admin/prices" },
] as const;

export function AdminNav({ sections }: { sections: string[] }) {
  const t = useTranslations("admin");
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = sections.map((s) => ({ key: s, href: s === "dashboard" ? "/admin" : `/admin/${s}`, icon: ICONS[s as keyof typeof ICONS] }));
  const isItemActive = (key: string, href: string) => {
    if (key === "services") return path.startsWith("/admin/services") || path.startsWith("/admin/prices");
    if (href === "/admin") return path === "/admin";
    return path.startsWith(href);
  };

  const renderItem = (i: { key: string; href: string; icon: typeof Gauge }) => {
    if (i.key === "services") {
      const active = isItemActive("services", i.href);
      return (
        <div key="services">
          <div className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium", active ? "text-brand" : "text-muted")}>
            <i.icon size={18} /> {t("nav.services")}
          </div>
          <div className="ml-5 mt-0.5 space-y-0.5">
            {SERVICES_SUBS.map((sub) => (
              <Link
                key={sub.key}
                href={sub.href}
                onClick={() => setOpen(false)}
                className={cn("flex items-center rounded-lg px-3 py-2 text-sm font-medium", path.startsWith(sub.href) ? "bg-ink text-inverse" : "text-ink hover:bg-surface")}
              >
                {t(`nav.${sub.key}`)}
              </Link>
            ))}
          </div>
        </div>
      );
    }
    return (
      <Link key={i.key} href={i.href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium", isItemActive(i.key, i.href) ? "bg-ink text-inverse" : "text-ink hover:bg-surface")}>
        <i.icon size={18} /> {t(`nav.${i.key}`)}
      </Link>
    );
  };

  const list = (
    <nav className="space-y-0.5">
      {items.map(renderItem)}
      <Link href="/" className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-surface"><ExternalLink size={18} /> {t("toSite")}</Link>
    </nav>
  );

  // Для мобильного заголовка — текущий раздел
  const currentKey = items.find((i) => isItemActive(i.key, i.href))?.key;
  const currentLabel = currentKey
    ? path.startsWith("/admin/prices")
      ? t("nav.prices")
      : path.startsWith("/admin/services")
        ? t("nav.catalog")
        : t(`nav.${currentKey}`)
    : t("title");

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 overflow-y-auto border-r border-line bg-paper p-3 md:block">
        <div className="mb-4 px-2 pt-1"><Logo /></div>
        {list}
      </aside>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-paper px-3 md:hidden">
        <button className="btn-ghost btn-sm px-2" onClick={() => setOpen(true)} aria-label={t("nav.menu")}><Menu size={22} /></button>
        <span className="font-semibold">{currentLabel}</span>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button className="absolute inset-0 bg-overlay/40" onClick={() => setOpen(false)} aria-label="close" />
          <div className="relative h-full w-72 overflow-y-auto bg-paper p-3">
            <div className="mb-3 flex items-center justify-between px-2"><Logo /><button onClick={() => setOpen(false)} className="btn-ghost btn-sm px-2"><X size={20} /></button></div>
            {list}
          </div>
        </div>
      )}
    </>
  );
}
