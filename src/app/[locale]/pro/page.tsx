import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth";
import { getMasterByUserId, getProVisits } from "@/server/services/pages/pro";
import { getSettings } from "@/server/settings";
import { tr } from "@/i18n/locales";
import { addDays, atYerevan, ymd, hm } from "@/lib/time";
import { amd, cn, dateLabel, durationLabel } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { StatusBadge } from "@/components/account/StatusBadge";
import { ProVisitActions } from "./ProVisitActions";
import { ProSettings } from "@/components/pro/ProSettings";
import { Img } from "@/components/Img";
import { PromoSlot } from "@/components/PromoSlot";

export default async function ProPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale } = await params;
  const { tab = "today" } = await searchParams;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/login?next=/pro", locale });
  const [t, to, tc, ta, settings] = await Promise.all([getTranslations("pro"), getTranslations("order"), getTranslations("common"), getTranslations("address"), getSettings()]);
  const master = await getMasterByUserId(user.id);
  if (!master) return <div className="container-m py-10 text-center text-muted">{t("notLinked")}</div>;

  const today = ymd(new Date());
  const range =
    tab === "today" ? { gte: atYerevan(today, "00:00"), lt: atYerevan(addDays(today, 1), "00:00") }
    : tab === "upcoming" ? { gte: atYerevan(addDays(today, 1), "00:00"), lt: atYerevan(addDays(today, 15), "00:00") }
    : { gte: atYerevan(addDays(today, -30), "00:00"), lt: atYerevan(addDays(today, 1), "00:00") };
  const isVisitTab = tab === "today" || tab === "upcoming" || tab === "done";
  const visits = isVisitTab ? await getProVisits(master.id, range, tab) : [];
  const cashToday = tab === "today" ? visits.filter((v) => v.order.paymentMethod === "CASH" && v.cashCollected).reduce((s, v) => s + v.price, 0) : 0;

  const tabs = [["today", t("today")], ["upcoming", t("upcoming")], ["done", t("done")], ["settings", t("settingsTab")]];
  return (
    <div className="container-m pt-4 pb-10">
      <div className="card flex items-center gap-3 p-3">
        <Img src={master.photo || "/img/master-1.svg"} width={48} className="size-12 rounded-full object-cover" />
        <div className="flex-1">
          <div className="font-semibold">{tr(master.name, locale)}</div>
          <div className="text-xs text-muted">{master.reviewsCount ? `★ ${master.rating.toFixed(1)} · ${tc("reviews", { count: master.reviewsCount })}` : tc("new")} · {tc("jobs", { count: master.jobsCount })}</div>
        </div>
        {tab === "today" && <div className="text-right"><div className="text-xs text-muted">{t("cashToday")}</div><div className="font-bold">{amd(cashToday)}</div></div>}
      </div>
      <div className="my-4 overflow-x-auto">
        <div className="flex min-w-max gap-1 rounded-xl bg-paper p-1">
          {tabs.map(([k, l]) => <Link key={k} href={`/pro?tab=${k}`} className={cn("flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium whitespace-nowrap", tab === k ? "bg-ink text-inverse" : "text-muted")}>{l}</Link>)}
        </div>
      </div>
      <PromoSlot placement="MASTER_CABINET" locale={locale} />

      {tab === "settings" ? (
        <ProSettings
          notifyEnabled={master.notifyEnabled}
          staffChatId={master.staffChatId}
          botUsername={settings.team.botUsername}
        />
      ) : (
        <>
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
                      {v.startedAt && (() => {
                        const diff = Math.round((v.startedAt!.getTime() - v.scheduledAt!.getTime()) / 60_000);
                        const delay = diff > 0 ? to("visitTiming.lateMin", { n: diff }) : diff < 0 ? to("visitTiming.earlyMin", { n: -diff }) : to("visitTiming.onTime");
                        return <div className="mt-0.5 text-xs text-muted">{to("visitTiming.scheduled")} {hm(v.scheduledAt!)} → {to("visitTiming.started")} {hm(v.startedAt!)} · <span className={diff > 3 ? "text-bad" : diff < -1 ? "text-ok" : ""}>{delay}</span></div>;
                      })()}
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
                    {v.order.noCall && <div className="rounded-lg bg-warn-50 p-2 font-medium text-warn">📵 {t("noCall")}</div>}
                    <div>👤 {v.order.user.name || "—"} · {formatPhone(v.order.user.phone)}</div>
                    {v.order.paymentMethod === "CASH" && <div className="font-semibold">💵 {t("toCollect")}: {amd(v.price)}</div>}
                    {v.order.tipAmount > 0 && <div className="text-ok">✨ {t("tipAmount")}: {amd(v.order.tipAmount)}</div>}
                  </div>
                  <ProVisitActions visit={{ id: v.id, status: v.status, cashCollected: v.cashCollected, price: v.price, isCash: v.order.paymentMethod === "CASH" }} phone={v.order.user.phone} mapQuery={`${a.street} ${a.building}, Yerevan`} />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
