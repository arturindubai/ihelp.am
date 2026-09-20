"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Gauge, LayoutDashboard, ClipboardList, CalendarRange, Sparkles, UsersRound, Contact, Star, TicketPercent, Image, FileText, Languages, Settings, ShieldCheck, History, Menu, X, ExternalLink } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/format";
import { Logo } from "@/components/Logo";

const ICONS = { control: Gauge, dashboard: LayoutDashboard, orders: ClipboardList, schedule: CalendarRange, services: Sparkles, masters: UsersRound, clients: Contact, reviews: Star, promos: TicketPercent, banners: Image, pages: FileText, translations: Languages, settings: Settings, staff: ShieldCheck, log: History };

export function AdminNav({ sections, brand }: { sections: string[]; brand: string }) {
  const t = useTranslations("admin");
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = sections.map((s) => ({ key: s, href: s === "dashboard" ? "/admin" : `/admin/${s}`, icon: ICONS[s as keyof typeof ICONS] }));
  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  const list = (
    <nav className="space-y-0.5">
      {items.map((i) => (
        <Link key={i.key} href={i.href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium", isActive(i.href) ? "bg-ink text-inverse" : "text-ink hover:bg-surface")}>
          <i.icon size={18} /> {t(`nav.${i.key}`)}
        </Link>
      ))}
      <Link href="/" className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-surface"><ExternalLink size={18} /> {t("toSite")}</Link>
    </nav>
  );
  const current = items.find((i) => isActive(i.href));
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 overflow-y-auto border-r border-line bg-paper p-3 md:block">
        <div className="mb-4 flex items-center gap-2 px-2 pt-1 font-bold"><Logo className="size-7" /> {brand}</div>
        {list}
      </aside>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-paper px-3 md:hidden">
        <button className="btn-ghost btn-sm px-2" onClick={() => setOpen(true)} aria-label={t("nav.menu")}><Menu size={22} /></button>
        <span className="font-semibold">{current ? t(`nav.${current.key}`) : t("title")}</span>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button className="absolute inset-0 bg-overlay/40" onClick={() => setOpen(false)} aria-label="close" />
          <div className="relative h-full w-72 overflow-y-auto bg-paper p-3">
            <div className="mb-3 flex items-center justify-between px-2"><span className="font-bold">{brand}</span><button onClick={() => setOpen(false)} className="btn-ghost btn-sm px-2"><X size={20} /></button></div>
            {list}
          </div>
        </div>
      )}
    </>
  );
}
