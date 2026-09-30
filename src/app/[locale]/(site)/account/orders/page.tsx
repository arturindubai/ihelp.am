import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth";
import { tr } from "@/i18n/locales";
import { getUpcomingVisits, getUserOrders } from "@/server/services/pages/account";
import { amd, dateLabel, cn } from "@/lib/format";
import { visitWindow } from "@/server/services/booking";
import { StatusBadge } from "@/components/account/StatusBadge";
import { VisitCacheSync } from "@/components/pwa/VisitCacheSync";
import { CLIENT_CACHE_KEY } from "@/lib/visitCache";

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale } = await params;
  const { tab = "upcoming" } = await searchParams;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/login?next=/account/orders", locale });
  const [t, to] = await Promise.all([getTranslations("account"), getTranslations("order")]);
  const now = new Date(Date.now() - 3 * 3600_000);

  const tabs = [
    { key: "upcoming", label: t("upcoming") },
    { key: "plans", label: t("subscriptions") },
    { key: "history", label: t("history") },
  ];

  let body: React.ReactNode;
  if (tab === "upcoming") {
    const visits = await getUpcomingVisits(user.id, now);
    body = visits.length ? (
      <ul className="space-y-2">
        {visits.map((v) => (
          <li key={v.id}>
            <Link href={`/account/orders/${v.orderId}`} className="card flex items-center gap-3 p-3">
              <div className="w-14 shrink-0 rounded-lg bg-surface py-1.5 text-center">
                <div className="text-lg leading-none font-bold">{dateLabel(v.scheduledAt!, locale, { day: "numeric" })}</div>
                <div className="text-[11px] text-muted">{dateLabel(v.scheduledAt!, locale, { month: "short" })}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{tr(v.order.service.title, locale)}</div>
                <div className="text-sm text-muted">{dateLabel(v.scheduledAt!, locale, { weekday: "short" })}, {visitWindow(v)}{v.master && ` · ${tr(v.master.name, locale)}`}</div>
                <StatusBadge status={v.status} label={to(`visitStatus.${v.status}`)} />
              </div>
              <ChevronRight size={18} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    ) : null;
  } else {
    const orders = await getUserOrders(user.id, tab as "plans" | "history");
    body = orders.length ? (
      <ul className="space-y-2">
        {orders.map((o) => (
          <li key={o.id}>
            <Link href={`/account/orders/${o.id}`} className="card flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><span className="font-semibold">{tr(o.service.title, locale)}</span><span className="text-sm font-semibold">{amd(o.kind === "SUBSCRIPTION" ? o.pricePerVisit : o.total)}</span></div>
                <div className="text-sm text-muted">{to("number", { number: o.number })} · {o.plan ? tr(o.plan.title, locale) : ""}</div>
                {o.kind === "PACKAGE" && <div className="text-xs text-muted">{to("remaining", { count: o.visits.filter((v) => v.status === "UNSCHEDULED").length })}</div>}
                <StatusBadge status={o.status} label={to(`status.${o.status}`)} />
              </div>
              <ChevronRight size={18} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    ) : null;
  }

  return (
    <div className="container-m pt-4">
      {tab === "upcoming" && <VisitCacheSync endpoint="/api/visits/me" cacheKey={CLIENT_CACHE_KEY} />}
      <h1 className="h1 mb-3">{t("orders")}</h1>
      <div className="mb-4 flex gap-1 rounded-xl bg-surface p-1">
        {tabs.map((x) => (
          <Link key={x.key} href={`/account/orders?tab=${x.key}`} className={cn("flex-1 rounded-lg py-2 text-center text-sm font-medium", tab === x.key ? "bg-paper shadow-sm" : "text-muted")}>{x.label}</Link>
        ))}
      </div>
      {body || (
        <div className="py-10 text-center">
          <p className="text-muted">{t("noOrders")}</p>
          <Link href="/services" className="btn-primary mt-4">{t("bookNow")}</Link>
        </div>
      )}
    </div>
  );
}
