import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageUser } from "@/server/adminPage";
import { tr } from "@/i18n/locales";
import { hm } from "@/lib/time";
import { amd, dateLabel } from "@/lib/format";
import { getDashboardData } from "@/server/services/pages/admin";
import { PageHead, Stat, Forbidden } from "@/components/admin/ui";
import { StatusBadge } from "@/components/account/StatusBadge";

export default async function Dashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await pageUser("dashboard"))) return <Forbidden />;
  const [t, to] = await Promise.all([getTranslations("admin"), getTranslations("order")]);
  const { todayCnt, tomorrowCnt, newOrders, revenue, subs, unassigned, pendingReviews, visits30, first30, cashNotConfirmed, cashInHands, upcoming, recent, workMin, busyMin } = await getDashboardData();
  const load = workMin ? Math.round((busyMin / workMin) * 100) : 0;
  const firstShare = visits30 ? Math.round((first30 / visits30) * 100) : 0;

  return (
    <div>
      <PageHead title={t("nav.dashboard")} sub={dateLabel(new Date(), locale, { weekday: "long", day: "numeric", month: "long" })} />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label={t("dashboard.today")} value={todayCnt} />
        <Stat label={t("dashboard.tomorrow")} value={tomorrowCnt} />
        <Stat label={t("dashboard.newOrders")} value={newOrders} />
        <Stat label={t("dashboard.revenue")} value={amd(revenue._sum.price || 0)} />
        <Stat label={t("dashboard.activeSubs")} value={subs} />
        <Stat label={t("dashboard.load")} value={`${load}%`} hint={t("dashboard.loadHint")} tone={load >= 40 ? "ok" : "warn"} />
        <Stat label={t("dashboard.firstShare")} value={`${firstShare}%`} hint={t("dashboard.firstShareHint")} tone={firstShare > 34 ? "bad" : firstShare > 25 ? "warn" : "ok"} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="card p-3">
          <div className="text-xs text-muted">{t("dashboard.cashNotConfirmed")}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`text-2xl font-bold ${cashNotConfirmed._sum.price ? "text-warn" : ""}`}>{amd(cashNotConfirmed._sum.price || 0)}</span>
            {!!cashNotConfirmed._sum.price && <span className="text-warn">⚠</span>}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">{t("dashboard.cashNotConfirmedHint")}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">{t("dashboard.cashInHands")}</div>
          <div className="mt-1 text-2xl font-bold">{amd(cashInHands._sum.price || 0)}</div>
          <div className="mt-0.5 text-[11px] text-muted">{t("dashboard.cashInHandsHint")}</div>
          <div className="mt-0.5 text-[11px] text-muted italic">{t("dashboard.cashInHandsTooltip")}</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Link href="/admin/schedule"><Stat label={t("dashboard.unassigned")} value={unassigned} tone={unassigned ? "bad" : "ok"} /></Link>
        <Link href="/admin/reviews"><Stat label={t("dashboard.pendingReviews")} value={pendingReviews} tone={pendingReviews ? "warn" : undefined} /></Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card min-w-0 p-4">
          <h2 className="h3 mb-2">{t("dashboard.upcoming")}</h2>
          <ul className="divide-y divide-line">
            {upcoming.map((v) => (
              <li key={v.id}>
                <Link href={`/admin/orders/${v.orderId}`} className="flex items-center gap-3 py-2.5 text-sm">
                  <div className="w-20 shrink-0"><div className="font-semibold">{hm(v.scheduledAt!)}</div><div className="text-xs text-muted">{dateLabel(v.scheduledAt!, locale, { day: "numeric", month: "short" })}</div></div>
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{v.order.user.name || v.order.user.phone}</div><div className="truncate text-xs text-muted">{tr(v.order.service.title, locale)} · {v.master ? tr(v.master.name, locale) : <span className="text-bad">{t("orders.noMaster")}</span>}</div></div>
                  <StatusBadge status={v.status} label={to(`visitStatus.${v.status}`)} className="mt-0" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="card min-w-0 p-4">
          <h2 className="h3 mb-2">{t("dashboard.recentOrders")}</h2>
          <ul className="divide-y divide-line">
            {recent.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.id}`} className="flex items-center gap-3 py-2.5 text-sm">
                  <div className="w-12 shrink-0 font-semibold">№{o.number}</div>
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{o.user.name || o.user.phone}</div><div className="truncate text-xs text-muted">{tr(o.service.title, locale)} · {o.plan ? tr(o.plan.title, locale) : ""}</div></div>
                  <div className="text-right"><div className="font-semibold">{amd(o.kind === "SUBSCRIPTION" ? o.pricePerVisit : o.total)}</div><StatusBadge status={o.status} label={to(`status.${o.status}`)} className="mt-0" /></div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
