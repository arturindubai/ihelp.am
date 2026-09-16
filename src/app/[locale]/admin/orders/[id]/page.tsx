import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db";
import { pageUser } from "@/server/adminPage";
import { tr } from "@/i18n/locales";
import { amd, dateLabel, durationLabel } from "@/lib/format";
import { hm } from "@/lib/time";
import { formatPhone } from "@/lib/phone";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { StatusBadge } from "@/components/account/StatusBadge";
import { AdminOrderControls, AdminVisitRow, AdminAddVisit } from "@/components/admin/OrderControls";

export default async function AdminOrder({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await pageUser("orders"))) return <Forbidden />;
  const o = await db.order.findUnique({ where: { id }, include: { user: true, service: true, plan: true, promoCode: true, visits: { orderBy: [{ index: "asc" }], include: { master: true } } } });
  if (!o) notFound();
  const [t, to, ts, tb, ta] = await Promise.all([getTranslations("admin"), getTranslations("order"), getTranslations("service"), getTranslations("booking"), getTranslations("address")]);
  const masters = await db.master.findMany({ where: { skills: { some: { id: o.serviceId } } }, orderBy: { sort: "asc" } });
  const mList = masters.map((m) => ({ id: m.id, name: tr(m.name, locale), active: m.active }));
  const cfg = o.config as { options: { group: unknown; option: unknown; price: number; durationMin: number }[]; firstOrder?: boolean };
  const a = o.addressSnapshot as Record<string, string | null>;
  const pricing = o.pricing as { base: number; first: { price: number; discount: number; source: string }; regular: { price: number; discount: number }; payNow: number; visits: number | null };
  const r = o.recurrence as { weekdays: number[]; time: string; intervalDays: number } | null;
  const wd = tb("weekdaysShort").split(",");

  return (
    <div className="max-w-5xl">
      <PageHead title={t("orders.detail", { number: o.number })} sub={`${dateLabel(o.createdAt, locale, { day: "numeric", month: "long", year: "numeric" })} ${hm(o.createdAt)} · ${o.source}`} actions={<StatusBadge status={o.status} label={to(`status.${o.status}`)} className="mt-0 text-sm" />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-lg font-semibold">{tr(o.service.title, locale)}</div>
                <div className="text-sm text-muted">{o.plan ? tr(o.plan.title, locale) : ts(`kind.${o.kind}`)} · {durationLabel(o.durationMin, locale)}{cfg.firstOrder ? " · 🆕" : ""}</div>
              </div>
              <div className="text-right"><div className="text-lg font-bold">{amd(o.kind === "SUBSCRIPTION" ? o.pricePerVisit : o.total)}</div><div className="text-xs text-muted">{to(`payStatus.${o.paymentStatus}`)} · {o.paymentMethod === "CASH" ? tb("cash") : tb("card")}</div></div>
            </div>
            <table className="mt-3 w-full text-sm">
              <tbody>
                {cfg.options.map((x, i) => <tr key={i}><td className="py-0.5 text-muted">{tr(x.group, locale)}</td><td>{tr(x.option, locale)}</td><td className="text-right">{amd(x.price)}</td></tr>)}
                <tr className="border-t border-line"><td className="pt-1 text-muted">{t("orders.firstVisit")}</td><td className="pt-1 text-xs text-ok">{pricing.first.discount ? `−${amd(pricing.first.discount)} (${t(`orders.src.${pricing.first.source}`)})` : ""}</td><td className="pt-1 text-right font-semibold">{amd(o.firstVisitPrice)}</td></tr>
                {o.kind !== "ONE_TIME" && <tr><td className="text-muted">{t("orders.perVisit")}</td><td className="text-xs text-ok">{pricing.regular.discount ? `−${amd(pricing.regular.discount)}` : ""}</td><td className="text-right font-semibold">{amd(o.pricePerVisit)}</td></tr>}
                {o.promoCode && <tr><td className="text-muted">{t("orders.promo")}</td><td colSpan={2}>{o.promoCode.code}</td></tr>}
              </tbody>
            </table>
            {r && <p className="mt-2 text-sm"><span className="text-muted">{t("orders.recurrence")}: </span>{r.weekdays.map((d) => wd[d - 1]).join(", ")} {r.time} · {r.intervalDays} {t("orders.days")}</p>}
          </section>

          <section className="card p-4">
            <div className="mb-2 flex items-center justify-between"><h2 className="h3">{t("orders.visits")} ({o.visits.length})</h2></div>
            <ul className="divide-y divide-line">
              {o.visits.map((v) => (
                <AdminVisitRow key={v.id} visit={{ id: v.id, index: v.index, status: v.status, date: v.scheduledAt ? v.scheduledAt.toISOString() : null, label: v.scheduledAt ? `${dateLabel(v.scheduledAt, locale, { weekday: "short", day: "numeric", month: "short" })}, ${hm(v.scheduledAt)}` : to("unscheduled"), masterId: v.masterId, price: v.price, cash: v.cashCollected, isCash: o.paymentMethod === "CASH", note: v.masterNote }} masters={mList} />
              ))}
            </ul>
            <AdminAddVisit orderId={o.id} masters={mList} isSubscription={o.kind === "SUBSCRIPTION"} />
          </section>
        </div>

        <div className="space-y-4">
          <section className="card p-4 text-sm">
            <h2 className="h3 mb-2">{t("orders.client")}</h2>
            <Link href={`/admin/clients/${o.userId}`} className="font-semibold underline-offset-2 hover:underline">{o.user.name || "—"}</Link>
            <div><a href={`tel:${o.user.phone}`}>{formatPhone(o.user.phone)}</a></div>
            <div className="mt-1 flex gap-2">
              <a className="btn-outline btn-sm" href={`https://wa.me/${o.user.phone.replace("+", "")}`} target="_blank">WhatsApp</a>
              <a className="btn-outline btn-sm" href={`tel:${o.user.phone}`}>{t("orders.phone")}</a>
            </div>
            <h3 className="mt-4 mb-1 font-semibold">{t("orders.address")}</h3>
            <p>{[a.district, `${a.street} ${a.building}`, a.apartment && ta("aptShort", { n: a.apartment }), a.entrance && ta("entranceShort", { n: a.entrance }), a.floor && ta("floorShort", { n: a.floor })].filter(Boolean).join(", ")}</p>
            {a.intercom && <p className="text-muted">🔔 {a.intercom}</p>}
            {a.comment && <p className="text-muted">{a.comment}</p>}
            {o.comment && <><h3 className="mt-4 mb-1 font-semibold">{t("orders.comment")}</h3><p className="rounded-lg bg-warn-50 p-2">{o.comment}</p></>}
          </section>
          <AdminOrderControls order={{ id: o.id, status: o.status, kind: o.kind, paymentStatus: o.paymentStatus, preferredMasterId: o.preferredMasterId, pausedUntil: o.pausedUntil?.toISOString().slice(0, 10) || null }} masters={mList} />
        </div>
      </div>
    </div>
  );
}
