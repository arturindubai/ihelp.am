import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, CheckCircle2, Phone, MessageCircle, ShoppingCart } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth";
import { getUserOrderDetail } from "@/server/services/pages/account";
import { getSettings } from "@/server/settings";
import { tr } from "@/i18n/locales";
import { amd, dateLabel, durationLabel, timeLabel } from "@/lib/format";
import { hm } from "@/lib/time";
import { calcCancelPenalty } from "@/lib/cancelPenalty";
import { contactLinks } from "@/lib/contacts";
import { StatusBadge } from "@/components/account/StatusBadge";
import { OrderActions, OrderTrackerActions, VisitActions } from "@/components/account/OrderActions";
import { getOrderEventFeed } from "@/server/services/orderEvents";
import { ClearCart } from "@/components/ClearCart";
import { resolveCartEntry } from "@/server/services/cart";


function eventColor(status: string) {
  if (["DONE", "CONFIRMED", "SCHEDULED", "CREATED"].includes(status)) return "bg-ok";
  if (["ON_WAY", "IN_PROGRESS"].includes(status)) return "bg-warn";
  if (["CANCELLED", "NO_SHOW"].includes(status)) return "bg-bad";
  return "bg-line";
}

export default async function OrderPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { locale, id } = await params;
  const { new: isNew } = await searchParams;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) return redirect({ href: `/login?next=/account/orders/${id}`, locale });
  const o = await getUserOrderDetail(id, user.id);
  if (!o) notFound();
  const [settings, t, tb, ts, tc, ta, tCart, events, remainingCart] = await Promise.all([
    getSettings(),
    getTranslations("order"),
    getTranslations("booking"),
    getTranslations("service"),
    getTranslations("common"),
    getTranslations("address"),
    getTranslations("cart"),
    getOrderEventFeed(o.id),
    isNew ? resolveCartEntry({ userId: user.id }).catch(() => null) : Promise.resolve(null),
  ]);
  const remainingCartCount = remainingCart?.count ?? 0;
  const cfg = o.config as { options: { group: unknown; option: unknown; price: number }[]; plan?: { title?: unknown } | null };
  const a = o.addressSnapshot as Record<string, string | null>;
  const r = o.recurrence as { weekdays: number[]; time: string; intervalDays: number } | null;
  const wd = tb("weekdaysShort").split(",");

  // Ближайший активный визит
  const upcomingVisit = o.visits.find((v) =>
    ["SCHEDULED", "CONFIRMED", "UNSCHEDULED"].includes(v.status) &&
    (v.scheduledAt == null || v.scheduledAt > new Date())
  ) ?? null;

  const master = upcomingVisit?.master ?? null;

  // Последний выполненный визит без отзыва
  const reviewVisit = [...o.visits].reverse().find((v) => v.status === "DONE" && !v.review) ?? null;

  // Дедлайн бесплатной отмены (только для разовых заказов — у подписок нет ограничения по времени отмены)
  let cancelDeadline: { free: boolean; label: string } | null = null;
  if (o.kind === "ONE_TIME" && upcomingVisit?.scheduledAt && ["ACTIVE", "PAUSED"].includes(o.status)) {
    const scheduledAt = new Date(upcomingVisit.scheduledAt);
    const freeCancelAt = new Date(scheduledAt.getTime() - settings.booking.freeCancelHours * 3600_000);
    if (Date.now() < freeCancelAt.getTime()) {
      cancelDeadline = {
        free: true,
        label: `${dateLabel(freeCancelAt, locale, { day: "numeric", month: "short" })}, ${hm(freeCancelAt)}`,
      };
    } else if (settings.booking.lateCancelFeeAmd > 0) {
      cancelDeadline = { free: false, label: amd(settings.booking.lateCancelFeeAmd) };
    }
  }

  // Визит в пути или идёт работа → отмена заблокирована, только поддержка
  const isBusy = o.visits.some((v) => v.status === "ON_WAY" || v.status === "IN_PROGRESS");

  // Предпросмотр суммы штрафа для диалога подтверждения отмены
  const now2 = new Date();
  const freeLimit = new Date(now2.getTime() + settings.booking.freeCancelHours * 3600_000);
  const cancellableVisits = o.visits.filter((v) => ["SCHEDULED", "CONFIRMED", "UNSCHEDULED"].includes(v.status));
  const lateVisits2 = o.visits.filter((v) => ["SCHEDULED", "CONFIRMED"].includes(v.status) && v.scheduledAt && v.scheduledAt <= freeLimit);
  const firstLate2 = [...lateVisits2].sort((a, b) => (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0))[0];
  const previewFeeAmd = firstLate2?.scheduledAt ? calcCancelPenalty(firstLate2.scheduledAt, now2, settings.booking.freeCancelHours, settings.booking.lateCancelFeeAmd) : 0;
  const cancelPreview = ["ACTIVE", "PAUSED"].includes(o.status) ? {
    feeAmd: previewFeeAmd,
    freeDeadline: o.kind === "ONE_TIME" && cancelDeadline?.free ? cancelDeadline.label : undefined,
    freeHours: settings.booking.freeCancelHours,
    visitCount: cancellableVisits.length,
  } : null;

  // Контакты поддержки для кнопки «Связаться с поддержкой»
  const supportContacts = contactLinks(settings.brand).filter((c) => ["phone", "whatsapp", "telegram"].includes(c.key));

  // Синтетическое событие «Заказ создан» + реальные события
  const allEvents = [
    { id: "__created", status: "CREATED", createdAt: o.createdAt },
    ...events,
  ];

  const upcomingVisits = o.visits.filter((v) => v.status !== "SKIPPED" || (v.scheduledAt && v.scheduledAt > new Date()));
  const shown = o.kind === "SUBSCRIPTION"
    ? upcomingVisits.filter((v) => !v.scheduledAt || v.scheduledAt > new Date(Date.now() - 45 * 86400_000)).slice(-12)
    : o.visits;

  // Группируем события по визиту для списка визитов
  const eventsByVisit = new Map<string, typeof events>();
  for (const e of events) {
    const list = eventsByVisit.get(e.visitId) ?? [];
    list.push(e);
    eventsByVisit.set(e.visitId, list);
  }

  // Данные для клиентских компонентов
  const upcomingVisitProps = upcomingVisit
    ? { id: upcomingVisit.id, status: upcomingVisit.status, scheduledAt: upcomingVisit.scheduledAt?.toISOString() ?? null }
    : null;
  const reviewVisitProp = reviewVisit ? { id: reviewVisit.id } : null;
  const orderProps = {
    id: o.id, kind: o.kind, status: o.status,
    serviceId: o.serviceId, durationMin: o.durationMin,
    serviceSlug: o.service.slug,
  };

  // Карточка мастера (используется в двух местах)
  const masterName = master ? tr(master.name, locale) : "";
  const masterInitial = masterName.charAt(0).toUpperCase();

  return (
    <div className="container-w pb-10 pt-3">
      {/* Навбар */}
      <div className="mb-4 flex items-center gap-3">
        <Link href="/account/orders" className="grid size-9 shrink-0 place-items-center rounded-full bg-surface" aria-label={tc("back")}>
          <ArrowLeft size={18} />
        </Link>
        <h1 className="flex-1 text-xl font-bold">{t("number", { number: o.number })}</h1>
        <StatusBadge status={o.status} label={t(`status.${o.status}`)} />
      </div>

      {/* Баннер «Заказ оформлен» при ?new=1 */}
      {isNew && (
        <>
          <ClearCart />
          <div className="mb-4 flex gap-3 rounded-2xl bg-ok-50 p-4 text-ok">
            <CheckCircle2 className="shrink-0" />
            <div>
              <div className="font-semibold">{tb("success")}</div>
              <div className="text-sm">{tb("successSub")}</div>
            </div>
          </div>
          {remainingCartCount > 0 && (
            <Link href="/cart" className="mb-4 flex items-center gap-3 rounded-2xl bg-brand-50 p-4 text-brand hover:bg-brand-100 transition-colors">
              <ShoppingCart size={20} className="shrink-0" />
              <span className="font-semibold text-sm">{tCart("cartBanner", { count: remainingCartCount })}</span>
            </Link>
          )}
        </>
      )}

      {/* Двухколоночный layout на десктопе */}
      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-8">
        {/* Левая колонка */}
        <div>
          {/* Правый сайдбар показывается сверху на мобильном */}
          <div className="mb-6 space-y-4 lg:hidden">
            {upcomingVisit?.scheduledAt && (
              <div className="card p-4">
                <div className="text-sm font-medium text-muted">{t("visits")}</div>
                <div className="mt-1 text-xl font-bold">
                  {dateLabel(upcomingVisit.scheduledAt, locale, { weekday: "short", day: "numeric", month: "long" })}, {hm(upcomingVisit.scheduledAt)}
                </div>
                <div className="mt-0.5 text-sm text-muted">
                  {[a.street, a.building].filter(Boolean).join(" ")} · {durationLabel(o.durationMin, locale)}
                </div>
              </div>
            )}
            <div className="card p-4">
              <div className="mb-3 text-sm font-medium text-muted">{t("masterCard")}</div>
              {master ? (
                <>
                  <div className="flex items-center gap-3">
                    {master.photo ? (
                      <img src={master.photo} alt="" className="size-14 rounded-full object-cover" />
                    ) : (
                      <div className="grid size-14 shrink-0 place-items-center rounded-full bg-brand-50 text-lg font-bold text-brand-text">
                        {masterInitial}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{masterName}</div>
                      {master.reviewsCount > 0 ? (
                        <div className="text-sm text-muted">
                          ★ {master.rating.toFixed(1)} · {tc("reviews", { count: master.reviewsCount })}
                          {master.experienceYears > 0 && ` · ${tc("yearsExp", { count: master.experienceYears })}`}
                        </div>
                      ) : (
                        <div className="text-sm text-muted">{t("masterNew")}</div>
                      )}
                    </div>
                  </div>
                  {master.phone && (
                    <div className="mt-3 flex gap-2">
                      <a href={`tel:${master.phone}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-surface px-3 py-2 text-sm font-medium hover:bg-brand-50">
                        <Phone size={15} /> {t("callMaster")}
                      </a>
                      <a href={`https://wa.me/${master.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-surface px-3 py-2 text-sm font-medium hover:bg-brand-50">
                        <MessageCircle size={15} /> {t("writeMaster")}
                      </a>
                    </div>
                  )}
                  <div className="mt-2 text-center">
                    <Link href="/account" className="text-xs text-muted hover:underline">{t("supportLink")}</Link>
                  </div>
                </>
              ) : (
                <div className="rounded-xl bg-surface p-3 text-sm text-muted">{t("masterNotAssigned")}</div>
              )}
            </div>
            <OrderTrackerActions
              order={orderProps}
              upcomingVisit={upcomingVisitProps}
              reviewVisit={reviewVisitProp}
              cancelDeadline={cancelDeadline}
              freeCancelHours={settings.booking.freeCancelHours}
              horizonDays={settings.booking.horizonDays}
              isBusy={isBusy}
              cancelPreview={cancelPreview}
              supportContacts={supportContacts}
            />
          </div>

          {/* Лента событий */}
          {allEvents.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-3 text-base font-semibold">{t("timeline")}</h2>
              <ol className="relative space-y-3 pl-5">
                {allEvents.map((e, i) => (
                  <li key={e.id} className="relative">
                    <span className={`absolute left-[-20px] top-1.5 size-3 rounded-full ${eventColor(e.status)}`} />
                    {i < allEvents.length - 1 && (
                      <span className="absolute bottom-[-12px] left-[-15px] top-4 w-px bg-line" />
                    )}
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm">{t(`visitEvents.${e.status}` as Parameters<typeof t>[0])}</span>
                      <span className="shrink-0 text-xs text-muted">{timeLabel(e.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Детали заказа */}
          <section className="card mb-6 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-semibold">{tr(o.service.title, locale)}</div>
                <div className="text-sm text-muted">{tr(cfg.plan?.title, locale) || ts(`kind.${o.kind}`)} · {durationLabel(o.durationMin, locale)}</div>
              </div>
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
              {o.status === "CANCELLED" && <div className="flex justify-between gap-4"><dt className="text-muted">{t("cancelledAt")}</dt><dd className="text-right text-sm text-muted">{dateLabel(o.updatedAt, locale, { day: "numeric", month: "short" })}, {timeLabel(o.updatedAt)}</dd></div>}
              {o.cancelPenalty > 0 && <div className="flex justify-between"><dt className="text-muted">{t("cancelPenaltyLabel")}</dt><dd className="font-semibold text-bad">{amd(o.cancelPenalty)}</dd></div>}
            </dl>
            <OrderActions order={{ id: o.id, kind: o.kind, status: o.status, serviceSlug: o.service.slug }} />
          </section>

          {/* Список визитов */}
          <h2 className="h2 mb-2">{t("visits")}</h2>
          <ul className="space-y-2">
            {shown.map((v) => {
              const visitEvents = eventsByVisit.get(v.id) ?? [];
              return (
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
                  {visitEvents.length > 0 && (
                    <div className="mt-3 border-t border-line pt-3">
                      <div className="mb-1.5 text-xs font-medium text-muted">{t("visitEvents.title")}</div>
                      <ol className="space-y-1">
                        {visitEvents.map((e) => (
                          <li key={e.id} className="flex items-center gap-2 text-xs text-muted">
                            <span className="shrink-0">{timeLabel(e.createdAt)}</span>
                            <span className="text-ink">{t(`visitEvents.${e.status}` as Parameters<typeof t>[0])}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Правая колонка: только на десктопе, sticky */}
        <div className="hidden space-y-4 lg:block lg:sticky lg:top-4">
          {upcomingVisit?.scheduledAt && (
            <div className="card p-4">
              <div className="text-sm font-medium text-muted">{t("visits")}</div>
              <div className="mt-1 text-xl font-bold">
                {dateLabel(upcomingVisit.scheduledAt, locale, { weekday: "short", day: "numeric", month: "long" })}, {hm(upcomingVisit.scheduledAt)}
              </div>
              <div className="mt-0.5 text-sm text-muted">
                {[a.street, a.building].filter(Boolean).join(" ")} · {durationLabel(o.durationMin, locale)}
              </div>
            </div>
          )}
          <div className="card p-4">
            <div className="mb-3 text-sm font-medium text-muted">{t("masterCard")}</div>
            {master ? (
              <>
                <div className="flex items-center gap-3">
                  {master.photo ? (
                    <img src={master.photo} alt="" className="size-14 rounded-full object-cover" />
                  ) : (
                    <div className="grid size-14 shrink-0 place-items-center rounded-full bg-brand-50 text-lg font-bold text-brand-text">
                      {masterInitial}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{masterName}</div>
                    {master.reviewsCount > 0 ? (
                      <div className="text-sm text-muted">
                        ★ {master.rating.toFixed(1)} · {tc("reviews", { count: master.reviewsCount })}
                        {master.experienceYears > 0 && ` · ${tc("yearsExp", { count: master.experienceYears })}`}
                      </div>
                    ) : (
                      <div className="text-sm text-muted">{t("masterNew")}</div>
                    )}
                  </div>
                </div>
                {master.phone && (
                  <div className="mt-3 flex gap-2">
                    <a href={`tel:${master.phone}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-surface px-3 py-2 text-sm font-medium hover:bg-brand-50">
                      <Phone size={15} /> {t("callMaster")}
                    </a>
                    <a href={`https://wa.me/${master.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-surface px-3 py-2 text-sm font-medium hover:bg-brand-50">
                      <MessageCircle size={15} /> {t("writeMaster")}
                    </a>
                  </div>
                )}
                <div className="mt-2 text-center">
                  <Link href="/account" className="text-xs text-muted hover:underline">{t("supportLink")}</Link>
                </div>
              </>
            ) : (
              <div className="rounded-xl bg-surface p-3 text-sm text-muted">{t("masterNotAssigned")}</div>
            )}
          </div>
          <OrderTrackerActions
            order={orderProps}
            upcomingVisit={upcomingVisitProps}
            reviewVisit={reviewVisitProp}
            cancelDeadline={cancelDeadline}
            freeCancelHours={settings.booking.freeCancelHours}
            horizonDays={settings.booking.horizonDays}
            isBusy={isBusy}
            cancelPreview={cancelPreview}
            supportContacts={supportContacts}
          />
        </div>
      </div>
    </div>
  );
}
