"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Banknote, CreditCard, Tag, Check, UsersRound, ArrowLeft, Phone, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, Link } from "@/i18n/navigation";
import { calculatePrice, type PricePromo, type PricingRules } from "@/lib/pricing";
import { amd, cn, dateLabel, durationLabel } from "@/lib/format";
import { addDays, atYerevan, isoWeekday, ymd } from "@/lib/time";
import { createOrderAction, promoAction, slotsAction } from "@/server/actions/booking";
import { Sheet } from "@/components/ui/Sheet";
import { AddressForm, addressLine, type AddressRow } from "./AddressForm";
import { Img } from "@/components/Img";
import type { ContactKey } from "@/lib/contacts";
import { contactLink } from "@/lib/contacts";

type Line = { groupTitle: string; optionTitle: string; price: number; discountable: boolean; durationMin: number };
type Plan = { id: string; kind: "ONE_TIME" | "SUBSCRIPTION" | "PACKAGE"; title: string; discountPercent: number; packageVisits: number | null; visitsPerWeek: number | null } | null;
type MasterCard = { id: string; name: string; photo: string | null; rating: number; reviewsCount: number; experienceYears: number; languages: string[] };

function calDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function calFirstWeekday(year: number, month: number) {
  const d = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return d === 0 ? 7 : d;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-5">
      <h2 className="mb-3 text-[17px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Checkout(props: {
  service: { id: string; slug: string; title: string };
  lines: Line[];
  optionIds: string[];
  plan: Plan;
  durationMin: number;
  rules: PricingRules;
  isFirstOrder: boolean;
  addresses: AddressRow[];
  districts: string[];
  masters: MasterCard[];
  allowChooseMaster: boolean;
  horizonDays: number;
  cashEnabled: boolean;
  cardEnabled: boolean;
  freeCancelHours: number;
  contacts: Partial<Record<ContactKey, string>>;
}) {
  const t = useTranslations("booking");
  const ts = useTranslations("service");
  const tc = useTranslations("common");
  const ta = useTranslations("address");
  const locale = useLocale();
  const router = useRouter();
  const [addresses, setAddresses] = useState(props.addresses);
  const [addressId, setAddressId] = useState(props.addresses.find((a) => a.isDefault)?.id || props.addresses[0]?.id || "");
  const [addrOpen, setAddrOpen] = useState(false);
  const today = ymd(new Date());
  const days = useMemo(() => Array.from({ length: props.horizonDays }, (_, i) => addDays(today, i)), [today, props.horizonDays]);
  const [date, setDate] = useState(days[0]);
  const [slotsState, setSlotsState] = useState<{ date: string; list: { time: string; masterIds: string[]; available: boolean }[] } | null>(null);
  const slots = slotsState?.date === date ? slotsState.list : null;
  const setSlots = (list: { time: string; masterIds: string[]; available: boolean }[] | null, d = date) => setSlotsState(list ? { date: d, list } : null);
  const [time, setTime] = useState<string>();
  const [slotRace, setSlotRace] = useState(false);
  const [masterId, setMasterId] = useState<string | null>(null);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [payment, setPayment] = useState<"CASH" | "CARD">(props.cashEnabled ? "CASH" : "CARD");
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<PricePromo | null>(null);
  const [promoMsg, setPromoMsg] = useState<{ ok: boolean; text: string }>();
  const [noCall, setNoCall] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [loadingSlots, startSlots] = useTransition();

  const multiDays = props.plan?.kind === "SUBSCRIPTION" && (props.plan.visitsPerWeek || 0) > 1;
  const wdNames = t("weekdaysShort").split(",");
  const isCalendarMode = props.horizonDays > 14;
  const calWdNames = t("weekdaysMin").split(",");
  const [autoSkipped, setAutoSkipped] = useState(0);
  const [calMonth, setCalMonth] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { year: y, month: m - 1 };
  });
  const [noSlotsDates, setNoSlotsDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    setTime(undefined);
    setSlotRace(false);
    const d = date;
    startSlots(async () => {
      const r = await slotsAction(props.service.id, d, props.durationMin);
      setSlots(r, d);
      if (r.length === 0) setNoSlotsDates((prev) => { const s = new Set(prev); s.add(d); return s; });
    });
    if (multiDays) setWeekdays((w) => (w.includes(isoWeekday(date)) ? w : [...w, isoWeekday(date)].sort()));
  }, [date, props.service.id, props.durationMin, multiDays]);

  useEffect(() => {
    if (slots && !slots.some((s) => s.available) && autoSkipped < 7 && date === days[autoSkipped]) {
      setAutoSkipped((n) => n + 1);
      if (days[autoSkipped + 1]) setDate(days[autoSkipped + 1]);
    }
  }, [slots, date, days, autoSkipped]);

  useEffect(() => {
    if (isCalendarMode) {
      const [y, m] = date.split("-").map(Number);
      setCalMonth({ year: y, month: m - 1 });
    }
  }, [date, isCalendarMode]);

  const slot = slots?.find((s) => s.time === time);
  const price = calculatePrice({ lines: props.lines, plan: props.plan ? { kind: props.plan.kind, discountPercent: props.plan.discountPercent, packageVisits: props.plan.packageVisits } : null, isFirstOrder: props.isFirstOrder, promo, rules: props.rules });

  async function applyPromo() {
    const code = promoInput.trim();
    if (!code) return;
    const r = await promoAction(props.service.slug, props.optionIds, props.plan?.id || null, code);
    if (!r.ok) {
      setPromo(null);
      return setPromoMsg({ ok: false, text: t(`promoErrors.${r.error}`, { amount: amd(("amount" in r && r.amount) || 0) }) });
    }
    const test = calculatePrice({ lines: props.lines, plan: props.plan ? { kind: props.plan.kind, discountPercent: props.plan.discountPercent, packageVisits: props.plan.packageVisits } : null, isFirstOrder: props.isFirstOrder, promo: r.promo, rules: props.rules });
    if (!test.promoApplied) {
      setPromo(null);
      return setPromoMsg({ ok: false, text: t("promoNotBetter") });
    }
    setPromo(r.promo);
    setPromoMsg({ ok: true, text: t("promoApplied", { code: r.promo.code }) });
  }

  function submit() {
    setError(undefined);
    if (!addressId) return setError(t("errors.no_address"));
    if (!time) return setError(t("errors.no_slot"));
    if (multiDays && weekdays.length < (props.plan?.visitsPerWeek || 2)) return setError(t("errors.days"));
    const fullComment = [noCall ? "[Не звонить] " : "", comment.trim()].join("").trim() || null;
    start(async () => {
      const r = await createOrderAction({
        slug: props.service.slug,
        optionIds: props.optionIds,
        planId: props.plan?.id || null,
        addressId,
        date,
        time,
        weekdays,
        masterId,
        promoCode: promo?.code || null,
        comment: fullComment,
        paymentMethod: payment,
        locale,
      });
      if (!r.ok) {
        if (r.error === "slot_taken") {
          setSlotRace(true);
          setTime(undefined);
          setSlots(await slotsAction(props.service.id, date, props.durationMin));
          return;
        }
        setError(t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : tc("error"));
        return;
      }
      router.replace(`/book/${props.service.slug}/success?orderId=${r.orderId}`);
    });
  }

  const payNowLabel = props.plan?.kind === "SUBSCRIPTION" ? t("payFirst") : t("payNow");
  const selectedAddress = addresses.find((a) => a.id === addressId);

  const horizonEnd = days.length > 0 ? days[days.length - 1] : today;
  const calMonthStr = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, "0")}-01`;
  const calMonthDate = atYerevan(calMonthStr, "12:00");
  const todayYear = parseInt(today.slice(0, 4));
  const todayMonthIdx = parseInt(today.slice(5, 7)) - 1;
  const canPrevMonth = calMonth.year > todayYear || (calMonth.year === todayYear && calMonth.month > todayMonthIdx);
  const nextMonthYear = calMonth.month === 11 ? calMonth.year + 1 : calMonth.year;
  const nextMonthIdx = calMonth.month === 11 ? 0 : calMonth.month + 1;
  const nextMonthFirstStr = `${nextMonthYear}-${String(nextMonthIdx + 1).padStart(2, "0")}-01`;
  const canNextMonth = nextMonthFirstStr <= horizonEnd;
  const calCells = useMemo<(string | null)[]>(() => {
    if (!isCalendarMode) return [];
    const empties = calFirstWeekday(calMonth.year, calMonth.month) - 1;
    const total = calDaysInMonth(calMonth.year, calMonth.month);
    return [
      ...Array(empties).fill(null),
      ...Array.from({ length: total }, (_, i) => {
        const day = String(i + 1).padStart(2, "0");
        const mo = String(calMonth.month + 1).padStart(2, "0");
        return `${calMonth.year}-${mo}-${day}`;
      }),
    ];
  }, [calMonth, isCalendarMode]);

  return (
    <div>
      {/* Sticky header */}
      <div className="sticky top-0 z-30 border-b border-line bg-paper">
        <div className="container-m flex min-h-16 items-center gap-3 py-2">
          <Link href={`/s/${props.service.slug}`} className="grid size-9 shrink-0 place-items-center rounded-full bg-surface" aria-label={tc("back")}>
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 font-bold leading-tight">{props.service.title}</p>
            <p className="text-xs text-muted">{durationLabel(props.durationMin, locale)}</p>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="container-m">
        {/* Адрес */}
        <Section title={t("address")}>
          {selectedAddress ? (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-paper p-3">
              <div className="min-w-0 flex-1 text-sm">
                {selectedAddress.label && <span className="block text-xs text-muted">{selectedAddress.label}</span>}
                <span className="font-medium">{addressLine(selectedAddress, (n) => ta("aptShort", { n }))}</span>
              </div>
              <button className="shrink-0 text-sm font-medium text-brand-text" onClick={() => setAddrOpen(true)}>{tc("edit")}</button>
            </div>
          ) : (
            <button className="btn-outline w-full" onClick={() => setAddrOpen(true)}>{t("addAddress")}</button>
          )}
        </Section>

        {/* Дата и время */}
        <Section title={t("dateTime")}>
          {/* Лента дней (horizonDays ≤ 14) / Календарь (horizonDays > 14) */}
          {isCalendarMode ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <button
                  disabled={!canPrevMonth}
                  onClick={() => setCalMonth((m) => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 })}
                  aria-label={t("calMonthNav.prev")}
                  className={cn("flex size-8 items-center justify-center rounded-full bg-surface transition", !canPrevMonth && "cursor-not-allowed opacity-40")}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-[15px] font-semibold capitalize">
                  {dateLabel(calMonthDate, locale, { month: "long", year: "numeric" })}
                </span>
                <button
                  disabled={!canNextMonth}
                  onClick={() => setCalMonth((m) => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 })}
                  aria-label={t("calMonthNav.next")}
                  className={cn("flex size-8 items-center justify-center rounded-full bg-surface transition", !canNextMonth && "cursor-not-allowed opacity-40")}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="mb-0.5 grid grid-cols-7 py-1 text-center text-xs uppercase text-muted">
                {calWdNames.map((n) => <div key={n}>{n}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {calCells.map((d, i) => {
                  if (!d) return <div key={`e${i}`} />;
                  const inHorizon = d >= today && d <= horizonEnd;
                  const isSelected = d === date;
                  const isToday = d === today;
                  const hasNoSlots = noSlotsDates.has(d);
                  return (
                    <button
                      key={d}
                      disabled={!inHorizon}
                      onClick={() => setDate(d)}
                      className={cn(
                        "relative flex aspect-square items-center justify-center rounded-xl text-sm font-medium transition",
                        isSelected
                          ? "border border-action bg-action text-on-action"
                          : !inHorizon
                          ? "cursor-not-allowed text-muted opacity-40"
                          : isToday
                          ? "border border-action bg-paper font-bold"
                          : hasNoSlots
                          ? "border border-line bg-paper text-muted"
                          : "border border-line bg-paper hover:bg-surface",
                        !isSelected && inHorizon && isToday && hasNoSlots && "text-muted",
                      )}
                    >
                      {parseInt(d.slice(8))}
                      {hasNoSlots && !isSelected && (
                        <span className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-muted" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
              {days.map((d) => {
                const dt = atYerevan(d, "12:00");
                const on = d === date;
                return (
                  <button
                    key={d}
                    ref={(el) => { if (el && on && el.parentElement) el.parentElement.scrollLeft = Math.max(0, el.offsetLeft - 16); }}
                    onClick={() => setDate(d)}
                    className={cn(
                      "flex min-h-[64px] min-w-[44px] flex-col items-center justify-center rounded-xl border px-2 text-center transition",
                      on ? "border-action bg-action text-on-action" : "border-line bg-paper"
                    )}
                  >
                    <span className={cn("text-xs capitalize", on ? "text-on-action/80" : "text-muted")}>{dateLabel(dt, locale, { weekday: "short" })}</span>
                    <span className="text-lg font-bold">{dateLabel(dt, locale, { day: "numeric" })}</span>
                    <span className={cn("text-[10px]", on ? "text-on-action/80" : "text-muted")}>{dateLabel(dt, locale, { month: "short" })}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Слоты */}
          <div className="mt-3">
            {isCalendarMode ? (
              <p className="mb-2 text-sm font-medium">
                {t("selectedDate", { date: dateLabel(atYerevan(date, "12:00"), locale, { day: "numeric", month: "long", weekday: "long" }) })}
              </p>
            ) : (
              <p className="mb-2 text-sm font-medium text-muted">{t("availableTime")}</p>
            )}
            {slotRace && (
              <div className="mb-2 rounded-xl bg-bad-50 px-3 py-2 text-sm text-bad">{t("errors.slot_taken")}</div>
            )}
            <div className="min-h-24">
              {loadingSlots || !slots ? (
                <div className="grid grid-cols-4 gap-1.5">
                  {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-surface" />)}
                </div>
              ) : slots.length === 0 ? (
                <p className="text-sm text-muted">{t("noSlots")}</p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {slots.map((s) => {
                    const on = s.time === time;
                    const occupied = !s.available;
                    return (
                      <button
                        key={s.time}
                        disabled={occupied}
                        onClick={() => { setTime(s.time); setSlotRace(false); if (masterId && !s.masterIds.includes(masterId)) setMasterId(null); }}
                        className={cn(
                          "flex min-h-11 items-center justify-center rounded-xl border text-sm font-semibold transition",
                          on ? "border-action bg-action text-on-action"
                            : occupied ? "cursor-not-allowed border-line text-muted line-through"
                            : "border-line bg-paper"
                        )}
                      >
                        {s.time}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {multiDays && (
            <div className="mt-4">
              <div className="mb-1 text-sm font-medium">{t("pickDays")}</div>
              <p className="mb-2 text-xs text-muted">{t("pickDaysHint", { count: props.plan?.visitsPerWeek || 2 })}</p>
              <div className="grid grid-cols-7 gap-1.5">
                {wdNames.map((n, i) => {
                  const wd = i + 1;
                  const on = weekdays.includes(wd);
                  const locked = wd === isoWeekday(date);
                  return (
                    <button
                      key={wd}
                      disabled={locked}
                      onClick={() => setWeekdays((w) => (on ? w.filter((x) => x !== wd) : [...w, wd].sort()))}
                      className={cn(
                        "flex min-h-10 items-center justify-center rounded-xl border text-sm font-semibold transition disabled:opacity-100",
                        on ? "border-action bg-action text-on-action" : "border-line bg-paper"
                      )}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Section>

        {/* Мастер */}
        {props.allowChooseMaster && props.masters.length > 0 && (
          <Section title={t("master")}>
            {!time && <p className="mb-2 text-sm text-muted">{t("chooseTimeFirst")}</p>}
            <div className="space-y-2">
              {/* Любой свободный */}
              <button
                onClick={() => setMasterId(null)}
                className={cn(
                  "flex w-full flex-row items-center gap-3 rounded-xl border p-3 text-left transition",
                  masterId === null ? "border-action bg-brand-50" : "border-line bg-paper"
                )}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-text">
                  <UsersRound size={20} />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{t("anyMaster")}</span>
                  <span className="block text-xs text-muted">{t("anyMasterSub")}</span>
                </span>
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition", masterId === null ? "border-action bg-action" : "border-line-strong")}>
                  {masterId === null && <span className="size-2 rounded-full bg-on-action" />}
                </span>
              </button>

              {/* Конкретные мастера */}
              {props.masters.map((m) => {
                const free = !slot || slot.masterIds.includes(m.id);
                const on = masterId === m.id;
                return (
                  <button
                    key={m.id}
                    disabled={!time || !free}
                    onClick={() => setMasterId(m.id)}
                    className={cn(
                      "flex w-full flex-row items-center gap-3 rounded-xl border p-3 text-left transition",
                      on ? "border-action bg-brand-50" : "border-line bg-paper",
                      (!time || !free) && "opacity-50"
                    )}
                  >
                    {m.photo ? (
                      <Img src={m.photo} width={44} className="size-11 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-sm font-bold text-muted">
                        {m.name.slice(0, 1)}
                      </span>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold">{m.name}</span>
                      <span className="block text-xs text-muted">
                        {time && !free
                          ? t("masterBusy")
                          : [
                              m.reviewsCount ? `★ ${m.rating.toFixed(1)} · ${tc("reviews", { count: m.reviewsCount })}` : tc("new"),
                              m.experienceYears > 0 ? tc("yearsExp", { count: m.experienceYears }) : null,
                            ].filter(Boolean).join(" · ")}
                      </span>
                      {m.languages.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {m.languages.map((lang) => (
                            <span key={lang} className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] text-muted">
                              {tc(`langNames.${lang}` as Parameters<typeof tc>[0]) || lang}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition", on ? "border-action bg-action" : "border-line-strong")}>
                      {on && <span className="size-2 rounded-full bg-on-action" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* Пожелания */}
        <Section title={t("wishes")}>
          <label className="flex cursor-pointer items-start gap-3">
            <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border-2 transition", noCall ? "border-action bg-action" : "border-line-strong")}>
              {noCall && <Check size={12} className="text-on-action" strokeWidth={3} />}
            </span>
            <input type="checkbox" className="sr-only" checked={noCall} onChange={(e) => setNoCall(e.target.checked)} />
            <span className="text-sm">{t("noCallLabel")}</span>
          </label>
          <textarea
            className="input mt-3 min-h-20 resize-none py-2"
            placeholder={t("commentPlaceholder")}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </Section>

        {/* Оплата */}
        <Section title={t("payment")}>
          <div className="space-y-2">
            {props.cashEnabled && (
              <button
                onClick={() => setPayment("CASH")}
                className={cn("flex w-full flex-row items-center gap-3 rounded-xl border p-3 text-left transition", payment === "CASH" ? "border-action bg-brand-50" : "border-line bg-paper")}
              >
                <Banknote size={20} className="shrink-0" />
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{t("cash")}</span>
                  <span className="block text-xs text-muted">{t("cashSub")}</span>
                </span>
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition", payment === "CASH" ? "border-action bg-action" : "border-line-strong")}>
                  {payment === "CASH" && <span className="size-2 rounded-full bg-on-action" />}
                </span>
              </button>
            )}
            <button
              disabled={!props.cardEnabled}
              onClick={() => props.cardEnabled && setPayment("CARD")}
              className={cn("flex w-full flex-row items-center gap-3 rounded-xl border p-3 text-left transition", payment === "CARD" ? "border-action bg-brand-50" : "border-line bg-paper", !props.cardEnabled && "opacity-50")}
            >
              <CreditCard size={20} className="shrink-0" />
              <span className="flex-1 text-sm font-semibold">{t("card")}</span>
              {!props.cardEnabled && (
                <span className="rounded-full bg-badge px-2 py-0.5 text-xs font-medium text-on-badge">{t("cardSoon")}</span>
              )}
              {props.cardEnabled && (
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition", payment === "CARD" ? "border-action bg-action" : "border-line-strong")}>
                  {payment === "CARD" && <span className="size-2 rounded-full bg-on-action" />}
                </span>
              )}
            </button>
          </div>

          <div className="mt-4">
            <label className="label flex items-center gap-1.5"><Tag size={15} /> {t("promo")}</label>
            <div className="flex gap-2">
              <input className="input uppercase" placeholder={t("promoPlaceholder")} value={promoInput} onChange={(e) => { setPromoInput(e.target.value); setPromoMsg(undefined); }} />
              {promo ? (
                <button className="btn-outline shrink-0" onClick={() => { setPromo(null); setPromoInput(""); setPromoMsg(undefined); }}>{tc("remove")}</button>
              ) : (
                <button className="btn-dark shrink-0" onClick={applyPromo} disabled={!promoInput.trim()}>{tc("apply")}</button>
              )}
            </div>
            {promoMsg && <p className={cn("mt-1.5 text-sm", promoMsg.ok ? "text-ok" : "text-bad")}>{promoMsg.text}</p>}
          </div>
        </Section>

        {/* Смета */}
        <section className="py-5">
          <h2 className="mb-3 text-[17px] font-semibold">{t("summary")}</h2>
          <dl className="space-y-1.5 text-sm">
            {props.lines.filter((l) => l.price > 0).map((l, i) => (
              <div key={i} className="flex justify-between">
                <dt className="text-muted">{l.optionTitle}</dt>
                <dd>{amd(l.price)}</dd>
              </div>
            ))}
            {price.first.discount > 0 && (
              <div className="flex justify-between text-ok">
                <dt>
                  {price.first.source.includes("promo")
                    ? `${t("discountPromo")} ${promo?.code || ""}`
                    : price.first.source === "first"
                    ? t("discountFirst")
                    : t("discountPlan")}
                  {props.plan?.kind !== "ONE_TIME" && ` (${ts("firstVisit")})`}
                </dt>
                <dd>−{amd(price.first.discount)}</dd>
              </div>
            )}
            {props.plan?.kind === "PACKAGE" && (price.visits || 1) > 1 && (
              <div className="flex justify-between">
                <dt className="text-muted">{`${(price.visits || 1) - 1} × ${amd(price.regular.price)}`}</dt>
                <dd>{amd(price.regular.price * ((price.visits || 1) - 1))}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
              <dt>{payNowLabel}</dt>
              <dd className="text-action">{amd(price.payNow)}</dd>
            </div>
            {props.plan?.kind === "SUBSCRIPTION" && (
              <p className="text-xs text-muted">{ts("thenPerVisit", { price: amd(price.regular.price) })}</p>
            )}
          </dl>

          {/* Блок экономии */}
          {props.isFirstOrder && price.first.discount > 0 && price.regular.discount > 0 && (
            <div className="mt-3 rounded-xl bg-ok-50 p-3 text-sm text-ok">
              {t("savings", { first: String(price.first.discount), regular: String(price.regular.discount) })}
            </div>
          )}

          {/* Бесплатная отмена */}
          <p className="mt-3 text-xs text-muted">
            <Link href="/p/cancellation" className="underline underline-offset-2">{t("cancelRules")}</Link>
            {" · "}
            {t("freeCancel", { hours: String(props.freeCancelHours) })}
          </p>

          <p className="mt-3 text-xs text-muted">
            {t.rich("agree", {
              offer: (c) => <Link href="/p/offer" className="underline underline-offset-2">{c}</Link>,
              cancel: (c) => <Link href="/p/cancellation" className="underline underline-offset-2">{c}</Link>,
              privacy: (c) => <Link href="/p/privacy" className="underline underline-offset-2">{c}</Link>,
            })}
          </p>

          {error && <p className="mt-3 rounded-xl bg-bad-50 px-3 py-2 text-sm text-bad">{error}</p>}
        </section>
      </div>

      {/* Sticky footer — кнопка подтвердить */}
      <div className="h-28" />
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper">
        <div className="container-m p-3">
          <button
            onClick={submit}
            disabled={!time || pending}
            className={cn(
              "flex h-[52px] w-full items-center justify-between rounded-[var(--radius-card)] bg-action px-4 font-bold text-on-action transition",
              (!time || pending) && "cursor-not-allowed opacity-50"
            )}
          >
            <span>{t("confirm")}</span>
            <span>{amd(price.payNow)}</span>
          </button>
        </div>
      </div>

      {/* Sheet адреса — список + добавить новый */}
      <Sheet open={addrOpen} onClose={() => setAddrOpen(false)} title={t("address")}>
        <div className="space-y-2">
          {addresses.map((a) => (
            <button
              key={a.id}
              onClick={() => { setAddressId(a.id); setAddrOpen(false); }}
              className={cn("flex w-full flex-row items-center gap-3 rounded-xl border p-3 text-left transition", a.id === addressId ? "border-action bg-brand-50" : "border-line bg-paper")}
            >
              <span className="flex-1 min-w-0">
                {a.label && <span className="block text-xs text-muted">{a.label}</span>}
                <span className="block text-sm font-medium">{addressLine(a, (n) => ta("aptShort", { n }))}</span>
              </span>
              {a.id === addressId && <Check size={18} className="shrink-0 text-action" />}
            </button>
          ))}
          <AddressForm
            districts={props.districts}
            onSaved={(a) => {
              setAddresses((list) => [...list.map((x) => (a.isDefault ? { ...x, isDefault: false } : x)), a]);
              setAddressId(a.id);
              setAddrOpen(false);
            }}
          />
        </div>
      </Sheet>
    </div>
  );
}
