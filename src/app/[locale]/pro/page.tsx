import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { tr } from "@/i18n/locales";
import { addDays, atYerevan, ymd, hm } from "@/lib/time";
import { amd, cn, dateLabel, durationLabel } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { StatusBadge } from "@/components/account/StatusBadge";
import { ProVisitActions } from "./ProVisitActions";

export default async function ProPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale } = await params;
  const { tab = "today" } = await searchParams;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/login?next=/pro", locale });
  const [t, to, tc, ta] = await Promise.all([getTranslations("pro"), getTranslations("order"), getTranslations("common"), getTranslations("address")]);
  const master = await db.master.findUnique({ where: { userId: user.id } });
  if (!master) return <div className="container-m py-10 text-center text-muted">{t("notLinked")}</div>;

  const today = ymd(new Date());
  const range =
    tab === "today" ? { gte: atYerevan(today, "00:00"), lt: atYerevan(addDays(today, 1), "00:00") }
    : tab === "upcoming" ? { gte: atYerevan(addDays(today, 1), "00:00"), lt: atYerevan(addDays(today, 15), "00:00") }
    : { gte: atYerevan(addDays(today, -30), "00:00"), lt: atYerevan(addDays(today, 1), "00:00") };
  const visits = await db.visit.findMany({
    where: { masterId: master.id, scheduledAt: range, status: tab === "done" ? "DONE" : { in: ["SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS", "DONE"] } },
    orderBy: { scheduledAt: tab === "done" ? "desc" : "asc" },
    include: { order: { include: { user: true, service: true } } },
  });
  const cashToday = tab === "today" ? visits.filter((v) => v.order.paymentMethod === "CASH" && v.cashCollected).reduce((s, v) => s + v.price, 0) : 0;

  const tabs = [["today", t("today")], ["upcoming", t("upcoming")], ["done", t("done")]];
  return (
    <div className="container-m pt-4 pb-10">
      <div className="card flex items-center gap-3 p-3">
        <img src={master.photo || "/img/master-1.svg"} alt="" className="size-12 rounded-full" />
        <div className="flex-1">
          <div className="font-semibold">{tr(master.name, locale)}</div>
          <div className="text-xs text-muted">{master.reviewsCount ? `★ ${master.rating.toFixed(1)} · ${tc("reviews", { count: master.reviewsCount })}` : tc("new")} · {tc("jobs", { count: master.jobsCount })}</div>
        </div>
        {tab === "today" && <div className="text-right"><div className="text-xs text-muted">{t("cashToday")}</div><div className="font-bold">{amd(cashToday)}</div></div>}
      </div>
      <div className="my-4 flex gap-1 rounded-xl bg-white p-1">
        {tabs.map(([k, l]) => <Link key={k} href={`/pro?tab=${k}`} className={cn("flex-1 rounded-lg py-2 text-center text-sm font-medium", tab === k ? "bg-ink text-white" : "text-muted")}>{l}</Link>)}
      </div>
      {visits.length === 0 && <p className="py-10 text-center text-muted">{t("noVisits")}</p>}
      <ul className="space-y-3">
        {visits.map((v) => {
          const a = v.order.addressSnapshot as Record<string, string | null>;
          const cfg = v.order.config as { options: { option: unknown }[] };
          const addr = [a.district, `${a.street} ${a.building}`, a.apartment && ta("aptShort", { n: a.apartment }), a.entrance && ta("entranceShort", { n: a.entrance }), a.floor && ta("floorShort", { n: a.floor })].filter(Boolean).join(", ");
          return (
            <li key={v.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-bold">{hm(v.scheduledAt!)} <span className="text-sm font-normal text-muted">· {durationLabel(v.durationMin, locale)}</span></div>
                  {tab !== "today" && <div className="text-sm text-muted">{dateLabel(v.scheduledAt!, locale)}</div>}
                </div>
                <StatusBadge status={v.status} label={to(`visitStatus.${v.status}`)} className="mt-0" />
              </div>
              <div className="mt-2 text-sm font-medium">{tr(v.order.service.title, locale)} · №{v.order.number}</div>
              <div className="mt-1 flex flex-wrap gap-1">{cfg.options.map((o, i) => <span key={i} className="chip">{tr(o.option, locale)}</span>)}</div>
              <div className="mt-3 space-y-1 text-sm">
                <div>📍 {addr}</div>
                {a.intercom && <div className="text-muted">🔔 {a.intercom}</div>}
                {a.comment && <div className="text-muted">💬 {a.comment}</div>}
                {v.order.comment && <div className="rounded-lg bg-warn-50 p-2 text-warn">{v.order.comment}</div>}
                <div>👤 {v.order.user.name || "—"} · {formatPhone(v.order.user.phone)}</div>
                {v.order.paymentMethod === "CASH" && <div className="font-semibold">💵 {t("toCollect")}: {amd(v.price)}</div>}
              </div>
              <ProVisitActions visit={{ id: v.id, status: v.status, cashCollected: v.cashCollected, price: v.price, isCash: v.order.paymentMethod === "CASH" }} phone={v.order.user.phone} mapQuery={`${a.street} ${a.building}, Yerevan`} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
