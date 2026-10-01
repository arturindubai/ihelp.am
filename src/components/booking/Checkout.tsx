"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Banknote, CreditCard, Tag, Check, UsersRound, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
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

const AVATAR_PALETTES = ["bg-brand-50 text-brand-text", "bg-ok-50 text-ok", "bg-surface text-muted"];
function masterAvatarBg(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}

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

const TIPS_PRESETS = [500, 1000, 1500] as const;

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
  lateCancelFeeAmd: number;
  contacts: Partial<Record<ContactKey, string>>;
  /** Предвыбранный адрес из последнего заказа */
  defaultAddressId?: string | null;
  /** Предвыбранный способ оплаты из последнего заказа */
  defaultPaymentMethod?: "CASH" | "CARD" | null;
}) {
  const t = useTranslations("booking");
  const ts = useTranslations("service");
  const tc = useTranslations("common");
  const ta = useTranslations("address");
  const locale = useLocale();
  const router = useRouter();
  const [addresses, setAddresses] = useState(props.addresses);
  const [addressId, setAddressId] = useState(() => {
    if (props.defaultAddressId && props.addresses.some((a) => a.id === props.defaultAddressId)) return props.defaultAddressId;
    return props.addresses.find((a) => a.isDefault)?.id || props.addresses[0]?.id || "";
  });
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
  const [filterMasterId, setFilterMasterId] = useState<string | null>(null);
  const [masterSheetSlot, setMasterSheetSlot] = useState<string | null>(null);
  const [masterSheetChoice, setMasterSheetChoice] = useState<string | null>(null);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [payment, setPayment] = useState<"CASH" | "CARD">(() => {
    if (props.defaultPaymentMethod === "CARD" && props.cardEnabled) return "CARD";
    if (props.defaultPaymentMethod === "CASH" && props.cashEnabled) return "CASH";
    return props.cashEnabled ? "CASH" : "CARD";
  });
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<PricePromo | null>(null);
  const [promoMsg, setPromoMsg] = useState<{ ok: boolean; text: string }>();
  const [noCall, setNoCall] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [loadingSlots, startSlots] = useTransition();

  const [tipsSelected, setTipsSelected] = useState<0 | 500 | 1000 | 1500 | "custom">(0);
  const [tipsCustomInput, setTipsCustomInput] = useState("");
  const tipsAmount = useMemo(() => {
    if (tipsSelected === 0) return 0;
    if (tipsSelected === "custom") {
      const v = parseInt(tipsCustomInput.replace(/\D/g, ""), 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    }
    return tipsSelected as number;
  }, [tipsSelected, tipsCustomInput]);
  const tipsCustomOver = tipsSelected === "custom" && parseInt(tipsCustomInput.replace(/\D/g, ""), 10) > 50000;

  const multiDays = props.plan?.kind === "SUBSCRIPTION" && (props.plan.visitsPerWeek || 0) > 1;
  const wdNames = t("weekdaysShort").split(",");
  const isCalendarMode = props.horizonDays > 14;
  const calWdNames = t("weekdaysMin").split(",");
  const masterById = useMemo(() => new Map(props.masters.map((m) => [m.id, m])), [props.masters]);
  const [autoSkipped, setAutoSkipped] = useState(0);
  const [calMonth, setCalMonth] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { year: y, month: m - 1 };
  });
  const [noSlotsDates, setNoSlotsDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    setTime(undefined);
    setSlotRace(false);
    setMasterSheetSlot(null);
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
        comment: comment.trim() || null,
        noCall,
        tipAmount: tipsAmount,
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
  const selectedMaster = masterId ? masterById.get(masterId) : undefined;
  const totalAmount = price.payNow + tipsAmount;

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

  const tipChipCls = "rounded-full border px-3 py-1 text-sm font-medium transition";
  const tipChipActive = "border-action bg-brand-50 text-brand";
  const tipChipInactive = "border-line bg-paper";

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
            <p className="text-xs text-muted">{durationLabel(props.durationMin, locale)} · {amd(price.payNow)}</p>
          </div>
        </div>
      </div>

      {/* Sections — на десктопе двухколоночный макет */}
      <div className="mx-auto w-full max-w-[560px] px-4 lg:max-w-[920px]">
        <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-8 lg:items-start">

          {/* Левая колонка: все секции формы */}
          <div>
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

            {/* Дата и мастер */}
            <Section title={props.allowChooseMaster && props.masters.length > 0 ? t("dateAndMaster") : t("dateTime")}>
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
                    const hasNoSlots = noSlotsDates.has(d);
                    return (
                      <button
                        key={d}
                        ref={(el) => { if (el && on && el.parentElement) el.parentElement.scrollLeft = Math.max(0, el.offsetLeft - 16); }}
                        onClick={() => setDate(d)}
                        className={cn(
                          "relative flex min-h-[64px] min-w-[44px] flex-col items-center justify-center rounded-xl border px-2 text-center transition",
                          on ? "border-action bg-action text-on-action" : "border-line bg-paper"
                        )}
                      >
                        <span className={cn("text-xs capitalize", on ? "text-on-action/80" : "text-muted")}>{dateLabel(dt, locale, { weekday: "short" })}</span>
                        <span className={cn("text-lg font-bold", !on && hasNoSlots && "text-muted")}>{dateLabel(dt, locale, { day: "numeric" })}</span>
                        <span className={cn("text-[10px]", on ? "text-on-action/80" : "text-muted")}>{dateLabel(dt, locale, { month: "short" })}</span>
                        {hasNoSlots && !on && (
                          <span className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-muted" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Подсказка длительности */}
              <p className="mt-2 text-xs text-muted">
                {t("durationHint", { duration: durationLabel(props.durationMin, locale) })}
              </p>

              {/* Фильтр-чипы мастеров */}
              {props.allowChooseMaster && props.masters.length > 0 && (
                <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
                  <button
                    onClick={() => { setFilterMasterId(null); setTime(undefined); setMasterId(null); }}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
                      filterMasterId === null ? "border-action bg-brand-50 text-brand" : "border-line bg-paper"
                    )}
                  >
                    <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-brand text-[11px] text-on-action">★</span>
                    <span>{t("anyMaster")}</span>
                  </button>
                  {props.masters.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setFilterMasterId(m.id); setTime(undefined); setMasterId(null); }}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
                        filterMasterId === m.id ? "border-action bg-brand-50 text-brand" : "border-line bg-paper"
                      )}
                    >
                      {m.photo ? (
                        <Img src={m.photo} width={26} className="size-[26px] shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className={cn("grid size-[26px] shrink-0 place-items-center rounded-full text-[10px] font-bold", masterAvatarBg(m.name))}>
                          {m.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span>{m.name.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Слоты с аватарами */}
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
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-surface" />)}
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="text-sm text-muted">{t("noSlots")}</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {slots.map((s) => {
                        const on = s.time === time;
                        const occupied = !s.available;
                        const slotMasters = s.masterIds.map((id) => masterById.get(id)).filter(Boolean) as MasterCard[];
                        const dimmed = !occupied && props.allowChooseMaster && filterMasterId !== null && !s.masterIds.includes(filterMasterId);
                        return (
                          <button
                            key={s.time}
                            disabled={occupied}
                            onClick={() => {
                              setTime(s.time);
                              setSlotRace(false);
                              if (!props.allowChooseMaster || props.masters.length === 0) {
                                setMasterId(null);
                              } else if (filterMasterId !== null) {
                                setMasterId(filterMasterId);
                              } else if (props.masters.length === 1) {
                                setMasterId(props.masters[0].id);
                              } else {
                                setMasterId(null);
                                setMasterSheetChoice(null);
                                setMasterSheetSlot(s.time);
                              }
                            }}
                            className={cn(
                              "flex flex-col items-center gap-1.5 rounded-xl border py-2 text-center transition",
                              on ? "border-action bg-brand-50 ring-1 ring-action" : "border-line bg-paper",
                              occupied && "cursor-not-allowed text-muted line-through",
                              dimmed && "pointer-events-none opacity-35"
                            )}
                          >
                            <span className="text-sm font-bold">{s.time}</span>
                            {props.allowChooseMaster && slotMasters.length > 0 && (
                              <div className="flex items-center">
                                {slotMasters.slice(0, 3).map((m, idx) => (
                                  m.photo ? (
                                    <Img key={m.id} src={m.photo} width={20} className={cn("size-5 rounded-full border-[1.5px] border-paper object-cover", idx > 0 && "-ml-1")} />
                                  ) : (
                                    <span key={m.id} className={cn("grid size-5 place-items-center rounded-full border-[1.5px] border-paper text-[8px] font-bold", idx > 0 && "-ml-1", masterAvatarBg(m.name))}>
                                      {m.name.slice(0, 1)}
                                    </span>
                                  )
                                ))}
                                {slotMasters.length > 3 && (
                                  <span className="-ml-1 flex size-5 items-center justify-center rounded-full border-[1.5px] border-paper bg-surface text-[8px] font-medium text-muted">
                                    +{slotMasters.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Политика отмены */}
              <p className="mt-2 flex items-center gap-1 text-xs text-muted">
                <Check size={12} className="shrink-0 text-ok" />
                {t("freeCancel", { hours: String(props.freeCancelHours) })}
                {props.lateCancelFeeAmd > 0 && (
                  <span>{" · "}{t("lateCancelFee", { amount: String(props.lateCancelFeeAmd) })}</span>
                )}
              </p>

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

            {/* Чаевые */}
            <Section title={t("tips")}>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setTipsSelected(0)}
                  className={cn(tipChipCls, tipsSelected === 0 ? tipChipActive : tipChipInactive)}
                >
                  {t("tipsNone")}
                </button>
                {TIPS_PRESETS.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setTipsSelected(amount)}
                    className={cn(tipChipCls, tipsSelected === amount ? tipChipActive : tipChipInactive)}
                  >
                    {amd(amount)}
                  </button>
                ))}
                <button
                  onClick={() => setTipsSelected("custom")}
                  className={cn(tipChipCls, tipsSelected === "custom" ? tipChipActive : tipChipInactive)}
                >
                  {t("tipsCustom")}
                </button>
              </div>
              {tipsSelected === "custom" && (
                <div className="mt-3">
                  <input
                    type="number"
                    inputMode="numeric"
                    className="input"
                    placeholder={t("tipsCustomPlaceholder")}
                    value={tipsCustomInput}
                    onChange={(e) => setTipsCustomInput(e.target.value)}
                  />
                  {tipsCustomOver && (
                    <p className="mt-1 text-xs text-bad">{t("tipsCustomMax")}</p>
                  )}
                </div>
              )}
              <p className="mt-2 text-xs text-muted">{t("tipsHint")}</p>
            </Section>

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
                {tipsAmount > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted">{t("tips")}</dt>
                    <dd>{amd(tipsAmount)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
                  <dt>{payNowLabel}</dt>
                  <dd className="text-action">{amd(totalAmount)}</dd>
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

          {/* Правая колонка: сводка (только на десктопе) */}
          <div className="hidden lg:block">
            <div className="sticky top-20 pt-5">
              <div className="card p-4">
                <h3 className="mb-4 text-[17px] font-semibold">{t("summarySidebar")}</h3>

                {/* Название услуги */}
                <p className="mb-3 text-sm font-medium">{props.service.title}</p>

                {/* Строки опций */}
                {props.lines.filter((l) => l.price > 0).length > 0 && (
                  <dl className="mb-3 space-y-1 text-sm">
                    {props.lines.filter((l) => l.price > 0).map((l, i) => (
                      <div key={i} className="flex justify-between">
                        <dt className="text-muted">{l.optionTitle}</dt>
                        <dd>{amd(l.price)}</dd>
                      </div>
                    ))}
                    {price.first.discount > 0 && (
                      <div className="flex justify-between text-ok">
                        <dt>{t("discountFirst")}</dt>
                        <dd>−{amd(price.first.discount)}</dd>
                      </div>
                    )}
                  </dl>
                )}

                {/* Дата и время */}
                {time && (
                  <div className="mb-1 text-sm">
                    <span className="text-muted">{t("dateTime")}: </span>
                    <span className="font-medium">
                      {dateLabel(atYerevan(date, time), locale, { day: "numeric", month: "long" })} {time}
                    </span>
                  </div>
                )}

                {/* Адрес */}
                {selectedAddress && (
                  <div className="mb-1 text-sm">
                    <span className="text-muted">{t("address")}: </span>
                    <span className="font-medium">{addressLine(selectedAddress, (n) => ta("aptShort", { n }))}</span>
                  </div>
                )}

                {/* Мастер */}
                {selectedMaster && (
                  <div className="mb-1 text-sm">
                    <span className="text-muted">{t("master")}: </span>
                    <span className="font-medium">{selectedMaster.name}</span>
                  </div>
                )}

                {/* Чаевые */}
                {tipsAmount > 0 && (
                  <div className="mb-1 text-sm">
                    <span className="text-muted">{t("tips")}: </span>
                    <span className="font-medium">{amd(tipsAmount)}</span>
                  </div>
                )}

                {/* Итог */}
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                  <span className="text-base font-bold">{payNowLabel}</span>
                  <span className="text-lg font-bold text-action">{amd(totalAmount)}</span>
                </div>

                {/* Кнопка подтвердить */}
                <button
                  onClick={submit}
                  disabled={!time || pending}
                  className={cn(
                    "mt-3 flex h-[52px] w-full items-center justify-between rounded-[var(--radius-card)] bg-action px-4 font-bold text-on-action transition",
                    (!time || pending) && "cursor-not-allowed opacity-50"
                  )}
                >
                  <span>{t("confirm")}</span>
                  <span>{amd(totalAmount)}</span>
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Sticky footer — мобильная кнопка (скрыта на десктопе) */}
      <div className="h-32 lg:hidden" />
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper lg:hidden">
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
            <span className="flex items-center gap-1.5">
              {amd(totalAmount)}
              {tipsAmount > 0 && (
                <span className="text-xs font-normal opacity-80">(+ {amd(tipsAmount)} {t("tips").toLowerCase()})</span>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* Sheet выбора мастера */}
      <Sheet
        open={masterSheetSlot !== null}
        onClose={() => setMasterSheetSlot(null)}
        title={t("whoComes")}
        footer={
          <button
            className="btn-dark w-full"
            onClick={() => { setMasterId(masterSheetChoice); setMasterSheetSlot(null); }}
          >
            {tc("done")}
          </button>
        }
      >
        <div className="space-y-2">
          <button
            onClick={() => setMasterSheetChoice(null)}
            className={cn(
              "flex w-full flex-row items-center gap-3 rounded-xl border p-3 text-left transition",
              masterSheetChoice === null ? "border-action bg-brand-50" : "border-line bg-paper"
            )}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-text">
              <UsersRound size={20} />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">{t("anyMaster")}</span>
              <span className="block text-xs text-muted">{t("anyMasterSub")}</span>
            </span>
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition", masterSheetChoice === null ? "border-action bg-action" : "border-line-strong")}>
              {masterSheetChoice === null && <span className="size-2 rounded-full bg-on-action" />}
            </span>
          </button>
          {props.masters.map((m) => {
            const slotMasterIds = masterSheetSlot ? (slots?.find((s) => s.time === masterSheetSlot)?.masterIds ?? null) : null;
            const free = !slotMasterIds || slotMasterIds.includes(m.id);
            const on = masterSheetChoice === m.id;
            return (
              <button
                key={m.id}
                disabled={!free}
                onClick={() => setMasterSheetChoice(m.id)}
                className={cn(
                  "flex w-full flex-row items-center gap-3 rounded-xl border p-3 text-left transition disabled:opacity-100",
                  on ? "border-action bg-brand-50" : "border-line bg-paper",
                  !free && "cursor-default"
                )}
              >
                {m.photo ? (
                  <Img src={m.photo} width={44} className={cn("size-11 shrink-0 rounded-full object-cover", !free && "grayscale")} />
                ) : (
                  <span className={cn("grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold", masterAvatarBg(m.name), !free && "grayscale")}>
                    {m.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{m.name}</span>
                  <span className="block text-xs text-muted">
                    {!free ? t("masterBusy") : (m.reviewsCount ? `★ ${m.rating.toFixed(1)} · ${tc("reviews", { count: m.reviewsCount })}` : tc("new"))}
                    {free && m.experienceYears > 0 && ` · ${tc("yearsExp", { count: m.experienceYears })}`}
                  </span>
                </span>
                {free && (
                  <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition", on ? "border-action bg-action" : "border-line-strong")}>
                    {on && <span className="size-2 rounded-full bg-on-action" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Sheet>

      {/* Sheet адреса */}
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
