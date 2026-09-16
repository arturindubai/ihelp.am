import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db";
import { pageUser } from "@/server/adminPage";
import { BUSY_STATUSES } from "@/server/services/booking";
import { tr } from "@/i18n/locales";
import { addDays, atYerevan, hm, isoWeekday, toMin, ymd } from "@/lib/time";
import { amd, dateLabel } from "@/lib/format";
import { PageHead, Stat, Forbidden } from "@/components/admin/ui";
import { StatusBadge } from "@/components/account/StatusBadge";

export default async function Dashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await pageUser("dashboard"))) return <Forbidden />;
  const [t, to] = await Promise.all([getTranslations("admin"), getTranslations("order")]);
  const today = ymd(new Date());
  const d0 = atYerevan(today, "00:00"), d1 = atYerevan(addDays(today, 1), "00:00"), d2 = atYerevan(addDays(today, 2), "00:00"), d7 = atYerevan(addDays(today, 7), "00:00");
  const ago7 = new Date(Date.now() - 7 * 86400_000), ago30 = new Date(Date.now() - 30 * 86400_000);

  const [todayCnt, tomorrowCnt, newOrders, revenue, subs, unassigned, pendingReviews, visits30, first30, cashPending, upcoming, recent, masters] = await Promise.all([
    db.visit.count({ where: { scheduledAt: { gte: d0, lt: d1 }, status: { in: [...BUSY_STATUSES, "DONE"] } } }),
    db.visit.count({ where: { scheduledAt: { gte: d1, lt: d2 }, status: { in: BUSY_STATUSES } } }),
    db.order.count({ where: { createdAt: { gte: ago7 } } }),
    db.visit.aggregate({ where: { status: "DONE", finishedAt: { gte: ago30 } }, _sum: { price: true } }),
    db.order.count({ where: { kind: "SUBSCRIPTION", status: "ACTIVE" } }),
    db.visit.count({ where: { masterId: null, scheduledAt: { gte: new Date() }, status: { in: BUSY_STATUSES } } }),
    db.review.count({ where: { status: "PENDING" } }),
    db.visit.count({ where: { scheduledAt: { gte: ago30, lt: d1 }, status: { in: [...BUSY_STATUSES, "DONE"] } } }),
    db.visit.count({ where: { index: 1, scheduledAt: { gte: ago30, lt: d1 }, status: { in: [...BUSY_STATUSES, "DONE"] }, order: { config: { path: ["firstOrder"], equals: true } } } }),
    db.visit.aggregate({ where: { status: "DONE", cashCollected: false, order: { paymentMethod: "CASH" } }, _sum: { price: true }, _count: true }),
    db.visit.findMany({ where: { scheduledAt: { gte: new Date() }, status: { in: BUSY_STATUSES } }, orderBy: { scheduledAt: "asc" }, take: 8, include: { master: true, order: { include: { user: true, service: true } } } }),
    db.order.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: true, service: true, plan: true } }),
    db.master.findMany({ where: { active: true }, include: { visits: { where: { scheduledAt: { gte: d0, lt: d7 }, status: { in: [...BUSY_STATUSES, "DONE"] } }, select: { durationMin: true } } } }),
  ]);

  let workMin = 0, busyMin = 0;
  for (const m of masters) {
    const wh = (m.workingHours || {}) as Record<string, [string, string][]>;
    for (let i = 0; i < 7; i++) for (const [f, e] of wh[String(isoWeekday(addDays(today, i)))] || []) workMin += toMin(e) - toMin(f);
    busyMin += m.visits.reduce((s, v) => s + v.durationMin, 0);
  }
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
        <Stat label={t("dashboard.cashPending")} value={amd(cashPending._sum.price || 0)} hint={`${cashPending._count}`} />
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
