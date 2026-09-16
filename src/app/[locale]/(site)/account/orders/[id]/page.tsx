import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { tr } from "@/i18n/locales";
import { amd, dateLabel, durationLabel } from "@/lib/format";
import { hm } from "@/lib/time";
import { StatusBadge } from "@/components/account/StatusBadge";
import { OrderActions, VisitActions } from "@/components/account/OrderActions";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { locale, id } = await params;
  const { new: isNew } = await searchParams;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) return redirect({ href: `/login?next=/account/orders/${id}`, locale });
  const o = await db.order.findFirst({
    where: { id, userId: user.id },
    include: { service: true, plan: true, visits: { orderBy: [{ index: "asc" }], include: { master: true, review: true } } },
  });
  if (!o) notFound();
  const [settings, t, tb, ts, tc, ta] = await Promise.all([getSettings(), getTranslations("order"), getTranslations("booking"), getTranslations("service"), getTranslations("common"), getTranslations("address")]);
  const cfg = o.config as { options: { group: unknown; option: unknown; price: number }[]; plan?: { title?: unknown } | null };
  const a = o.addressSnapshot as Record<string, string | null>;
  const r = o.recurrence as { weekdays: number[]; time: string; intervalDays: number } | null;
  const wd = tb("weekdaysShort").split(",");
  const upcomingVisits = o.visits.filter((v) => v.status !== "SKIPPED" || (v.scheduledAt && v.scheduledAt > new Date()));
  const shown = o.kind === "SUBSCRIPTION" ? upcomingVisits.filter((v) => !v.scheduledAt || v.scheduledAt > new Date(Date.now() - 45 * 86400_000)).slice(-12) : o.visits;

  return (
    <div className="container-m pt-3">
      <div className="flex items-center gap-3">
        <Link href="/account/orders" className="grid size-9 place-items-center rounded-full bg-surface" aria-label="back"><ArrowLeft size={18} /></Link>
        <h1 className="text-xl font-bold">{t("number", { number: o.number })}</h1>
      </div>

      {isNew && (
        <div className="mt-4 flex gap-3 rounded-2xl bg-ok-50 p-4 text-ok">
          <CheckCircle2 className="shrink-0" />
          <div><div className="font-semibold">{tb("success")}</div><div className="text-sm">{tb("successSub", { number: o.number })}</div></div>
        </div>
      )}

      <section className="card mt-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-lg font-semibold">{tr(o.service.title, locale)}</div>
            <div className="text-sm text-muted">{tr(cfg.plan?.title, locale) || ts(`kind.${o.kind}`)} · {durationLabel(o.durationMin, locale)}</div>
          </div>
          <StatusBadge status={o.status} label={t(`status.${o.status}`)} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">{cfg.options.map((x, i) => <span key={i} className="chip">{tr(x.option, locale)}</span>)}</div>
        {r && (
          <p className="mt-3 text-sm"><span className="text-muted">{t("every")}: </span>{r.weekdays.map((d) => wd[d - 1]).join(", ")} · {r.time}{r.intervalDays > 7 ? ` · ${t("everyWeeks", { n: r.intervalDays / 7 })}` : ""}</p>
        )}
        {o.pausedUntil && o.status === "PAUSED" && <p className="mt-1 text-sm text-warn">{t("pausedUntil", { date: dateLabel(o.pausedUntil, locale, { day: "numeric", month: "long" }) })}</p>}
        {o.kind === "PACKAGE" && o.expiresAt && <p className="mt-1 text-sm text-muted">{t("validUntil", { date: dateLabel(o.expiresAt, locale, { day: "numeric", month: "long", year: "numeric" }) })}</p>}
        <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted">{t("address")}</dt><dd className="text-right">{[a.street, a.building].join(" ")}{a.apartment ? `, ${ta("aptShort", { n: a.apartment })}` : ""}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">{t("payment")}</dt><dd>{o.paymentMethod === "CASH" ? t("cashNote") : t("card")}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">{t("price")}</dt><dd className="font-semibold">{o.kind === "SUBSCRIPTION" ? `${amd(o.pricePerVisit)} ${tc("perVisit")}` : amd(o.total)}</dd></div>
          {o.kind === "SUBSCRIPTION" && o.firstVisitPrice !== o.pricePerVisit && <div className="flex justify-between text-ok"><dt>{ts("firstVisit")}</dt><dd>{amd(o.firstVisitPrice)}</dd></div>}
        </dl>
        <OrderActions order={{ id: o.id, kind: o.kind, status: o.status }} />
      </section>

      <h2 className="h2 mt-6 mb-2">{t("visits")}</h2>
      <ul className="space-y-2">
        {shown.map((v) => (
          <li key={v.id} className="card p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{v.scheduledAt ? `${dateLabel(v.scheduledAt, locale)}, ${hm(v.scheduledAt)}` : t("visitN", { n: v.index })}</div>
                <div className="text-sm text-muted">{v.master ? tr(v.master.name, locale) : "—"} · {amd(v.price)}</div>
              </div>
              <StatusBadge status={v.status} label={t(`visitStatus.${v.status}`)} className="mt-0" />
            </div>
            <VisitActions
              visit={{ id: v.id, status: v.status, scheduledAt: v.scheduledAt?.toISOString() || null, hasReview: !!v.review }}
              order={{ kind: o.kind, status: o.status, serviceId: o.serviceId, durationMin: o.durationMin }}
              freeCancelHours={settings.booking.freeCancelHours}
              horizonDays={settings.booking.horizonDays}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
