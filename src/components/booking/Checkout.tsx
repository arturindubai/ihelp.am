"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Banknote, CreditCard, Tag, Check, UsersRound, ArrowLeft } from "lucide-react";
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
  const days = useMemo(() => Array.from({ length: Math.min(props.horizonDays, 7) }, (_, i) => addDays(today, i)), [today, props.horizonDays]);
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
  const masterById = useMemo(() => new Map(props.masters.map((m) => [m.id, m])), [props.masters]);

  useEffect(() => {
    setTime(undefined);
    setSlotRace(false);
    setMasterSheetSlot(null);
    const d = date;
    startSlots(async () => {
      const r = await slotsAction(props.service.id, d, props.durationMin);
      setSlots(r, d);
    });
    if (multiDays) setWeekdays((w) => (w.includes(isoWeekday(date)) ? w : [...w, isoWeekday(date)].sort()));
  }, [date, props.service.id, props.durationMin, multiDays]);

  const [autoSkipped, setAutoSkipped] = useState(0);
  useEffect(() => {
    if (slots && !slots.some((s) => s.available) && autoSkipped < 7 && date === days[autoSkipped]) {
      setAutoSkipped((n) => n + 1);
      if (days[autoSkipped + 1]) setDate(days[autoSkipped + 1]);
    }
  }, [slots, date, days, autoSkipped]);

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

        {/* Дата и мастер */}
        <Section title={props.allowChooseMaster && props.masters.length > 0 ? t("dateAndMaster") : t("dateTime")}>
          {/* Лента дней */}
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

      {/* Sheet выбора мастера — открывается при нажатии на слот когда фильтр «любой» и мастеров > 1 */}
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
          {(masterSheetSlot ? (slots?.find((s) => s.time === masterSheetSlot)?.masterIds ?? []) : []).map((mid) => {
            const m = masterById.get(mid);
            if (!m) return null;
            const on = masterSheetChoice === mid;
            return (
              <button
                key={mid}
                onClick={() => setMasterSheetChoice(mid)}
                className={cn(
                  "flex w-full flex-row items-center gap-3 rounded-xl border p-3 text-left transition",
                  on ? "border-action bg-brand-50" : "border-line bg-paper"
                )}
              >
                {m.photo ? (
                  <Img src={m.photo} width={44} className="size-11 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className={cn("grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold", masterAvatarBg(m.name))}>
                    {m.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{m.name}</span>
                  <span className="block text-xs text-muted">
                    {m.reviewsCount ? `★ ${m.rating.toFixed(1)} · ${tc("reviews", { count: m.reviewsCount })}` : tc("new")}
                    {m.experienceYears > 0 && ` · ${tc("yearsExp", { count: m.experienceYears })}`}
                  </span>
                </span>
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition", on ? "border-action bg-action" : "border-line-strong")}>
                  {on && <span className="size-2 rounded-full bg-on-action" />}
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>

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
