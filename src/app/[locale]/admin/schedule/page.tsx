import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db";
import { pageUser } from "@/server/adminPage";
import { tr } from "@/i18n/locales";
import { addDays, atYerevan, hm, isoWeekday, ymd } from "@/lib/time";
import { dateLabel, durationLabel } from "@/lib/format";
import { DateJump } from "@/components/admin/DateJump";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { StatusBadge } from "@/components/account/StatusBadge";

export default async function Schedule({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ date?: string }> }) {
  const { locale } = await params;
  const sp = await searchParams;
  if (!(await pageUser("schedule"))) return <Forbidden />;
  const [t, to] = await Promise.all([getTranslations("admin"), getTranslations("order")]);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date || "") ? sp.date! : ymd(new Date());
  const from = atYerevan(date, "00:00"), to_ = atYerevan(addDays(date, 1), "00:00");
  const [masters, visits] = await Promise.all([
    db.master.findMany({ where: { active: true }, orderBy: { sort: "asc" }, include: { timeOff: { where: { from: { lt: to_ }, to: { gt: from } } } } }),
    db.visit.findMany({ where: { scheduledAt: { gte: from, lt: to_ }, status: { notIn: ["CANCELLED", "SKIPPED"] } }, orderBy: { scheduledAt: "asc" }, include: { order: { include: { user: true, service: true } } } }),
  ]);
  const cols = [{ id: null as string | null, name: t("schedule.unassigned"), hours: "", off: false }, ...masters.map((m) => {
    const wh = ((m.workingHours || {}) as Record<string, [string, string][]>)[String(isoWeekday(date))] || [];
    return { id: m.id, name: tr(m.name, locale), hours: wh.map(([a, b]) => `${a}–${b}`).join(", "), off: !wh.length || m.timeOff.length > 0 };
  })];
  return (
    <div>
      <PageHead title={t("schedule.title")} actions={
        <div className="flex items-center gap-1">
          <Link href={`/admin/schedule?date=${addDays(date, -1)}`} className="btn-outline btn-sm px-2"><ChevronLeft size={18} /></Link>
          <Link href={`/admin/schedule`} className="btn-outline btn-sm">{t("common.today")}</Link>
          <DateJump value={date} base="/admin/schedule" />
          <Link href={`/admin/schedule?date=${addDays(date, 1)}`} className="btn-outline btn-sm px-2"><ChevronRight size={18} /></Link>
        </div>
      } sub={dateLabel(from, locale, { weekday: "long", day: "numeric", month: "long" })} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cols.map((c) => {
          const list = visits.filter((v) => v.masterId === c.id);
          if (c.id === null && !list.length) return null;
          const mins = list.reduce((s, v) => s + v.durationMin, 0);
          return (
            <section key={c.id || "none"} className={`card p-3 ${c.id === null ? "border-bad/40" : ""}`}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className={`font-semibold ${c.id === null ? "text-bad" : ""}`}>{c.name}</h2>
                <span className="text-xs text-muted">{c.id && (c.off ? t("schedule.dayOff") : c.hours)} {mins ? `· ${durationLabel(mins, locale)}` : ""}</span>
              </div>
              {list.length === 0 ? <p className="py-3 text-center text-sm text-muted">{t("schedule.noVisits")}</p> : (
                <ul className="space-y-2">
                  {list.map((v) => {
                    const a = v.order.addressSnapshot as Record<string, string | null>;
                    return (
                      <li key={v.id}>
                        <Link href={`/admin/orders/${v.orderId}`} className="block rounded-lg bg-surface p-2.5 text-sm hover:bg-line/60">
                          <div className="flex items-center justify-between gap-2"><span className="font-bold">{hm(v.scheduledAt!)}–{hm(new Date(v.scheduledAt!.getTime() + v.durationMin * 60_000))}</span><StatusBadge status={v.status} label={to(`visitStatus.${v.status}`)} className="mt-0" /></div>
                          {v.startedAt && (() => {
                            const diff = Math.round((v.startedAt!.getTime() - v.scheduledAt!.getTime()) / 60_000);
                            const delay = diff > 0 ? to("visitTiming.lateMin", { n: diff }) : diff < 0 ? to("visitTiming.earlyMin", { n: -diff }) : to("visitTiming.onTime");
                            return <div className="text-xs text-muted">{to("visitTiming.started")} {hm(v.startedAt!)} · <span className={diff > 3 ? "text-bad" : diff < -1 ? "text-ok" : ""}>{delay}</span></div>;
                          })()}
                          <div className="mt-0.5 truncate">{v.order.user.name || v.order.user.phone} · №{v.order.number}</div>
                          <div className="truncate text-xs text-muted">{a.district ? `${a.district}, ` : ""}{a.street} {a.building} · {tr(v.order.service.title, locale)}</div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
