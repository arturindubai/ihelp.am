"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Banknote, CreditCard, MapPin, Plus, Tag, Check, UsersRound } from "lucide-react";
import { useRouter, Link } from "@/i18n/navigation";
import { calculatePrice, type PricePromo, type PricingRules } from "@/lib/pricing";
import { amd, cn, dateLabel, durationLabel } from "@/lib/format";
import { addDays, atYerevan, isoWeekday, ymd } from "@/lib/time";
import { createOrderAction, promoAction, slotsAction } from "@/server/actions/booking";
import { Sheet } from "@/components/ui/Sheet";
import { PriceBar } from "@/components/service/PriceBar";
import { AddressForm, addressLine, type AddressRow } from "./AddressForm";

type Line = { groupTitle: string; optionTitle: string; price: number; discountable: boolean; durationMin: number };
type Plan = { id: string; kind: "ONE_TIME" | "SUBSCRIPTION" | "PACKAGE"; title: string; discountPercent: number; packageVisits: number | null; visitsPerWeek: number | null } | null;
type MasterCard = { id: string; name: string; photo: string | null; rating: number; reviewsCount: number; experienceYears: number };

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-5">
      <h2 className="mb-3 flex items-center gap-2 text-[17px] font-semibold">
        <span className="grid size-6 place-items-center rounded-full bg-ink text-xs font-bold text-white">{n}</span>
        {title}
      </h2>
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
  const [slotsState, setSlotsState] = useState<{ date: string; list: { time: string; masterIds: string[] }[] } | null>(null);
  const slots = slotsState?.date === date ? slotsState.list : null;
  const setSlots = (list: { time: string; masterIds: string[] }[] | null, d = date) => setSlotsState(list ? { date: d, list } : null);
  const [time, setTime] = useState<string>();
  const [masterId, setMasterId] = useState<string | null>(null);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [payment, setPayment] = useState<"CASH" | "CARD">(props.cashEnabled ? "CASH" : "CARD");
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<PricePromo | null>(null);
  const [promoMsg, setPromoMsg] = useState<{ ok: boolean; text: string }>();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [loadingSlots, startSlots] = useTransition();

  const multiDays = props.plan?.kind === "SUBSCRIPTION" && (props.plan.visitsPerWeek || 0) > 1;
  const wdNames = t("weekdaysShort").split(",");

  useEffect(() => {
    setTime(undefined);
    const d = date;
    startSlots(async () => {
      const r = await slotsAction(props.service.id, d, props.durationMin);
      setSlots(r, d);
    });
    if (multiDays) setWeekdays((w) => (w.includes(isoWeekday(date)) ? w : [...w, isoWeekday(date)].sort()));
  }, [date, props.service.id, props.durationMin, multiDays]);

  // Первые дни без слотов — автоматически пропускаем на ближайший доступный
  const [autoSkipped, setAutoSkipped] = useState(0);
  useEffect(() => {
    if (slots && slots.length === 0 && autoSkipped < 7 && date === days[autoSkipped]) {
      setAutoSkipped((n) => n + 1);
      setDate(days[autoSkipped + 1]);
    }
  }, [slots, date, days, autoSkipped]);

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
        comment: comment || null,
        paymentMethod: payment,
        locale,
      });
      if (!r.ok) {
        setError(t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : tc("error"));
        if (r.error === "slot_taken") {
          setTime(undefined);
          setSlots(await slotsAction(props.service.id, date, props.durationMin));
        }
        return;
      }
      router.replace(`/account/orders/${r.orderId}?new=1`);
    });
  }


  const payNowLabel = props.plan?.kind === "SUBSCRIPTION" ? t("payFirst") : t("payNow");

  return (
    <div>
      <div className="card mt-4 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold">{props.service.title}</div>
            <div className="text-sm text-muted">{[props.plan?.title, durationLabel(props.durationMin, locale)].filter(Boolean).join(" · ")}</div>
          </div>
          <Link href={`/s/${props.service.slug}`} className="link text-sm">{tc("edit")}</Link>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {props.lines.map((l, i) => <span key={i} className="chip">{l.optionTitle}</span>)}
        </div>
      </div>

      <Section n={1} title={t("address")}>
        <div className="space-y-2">
          {addresses.map((a) => (
            <button key={a.id} data-on={a.id === addressId} onClick={() => setAddressId(a.id)} className="select-card min-h-0 w-full flex-row items-center gap-3 py-3">
              <MapPin size={18} className="shrink-0" />
              <span className="flex-1">
                {a.label && <span className="block text-xs text-muted">{a.label}</span>}
                <span className="text-sm font-medium">{addressLine(a, (n) => ta("aptShort", { n }))}</span>
              </span>
              {a.id === addressId && <Check size={18} />}
            </button>
          ))}
          <button className="btn-outline w-full" onClick={() => setAddrOpen(true)}><Plus size={18} /> {t("addAddress")}</button>
        </div>
      </Section>

      <Section n={2} title={t("dateTime")}>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {days.map((d) => {
            const dt = atYerevan(d, "12:00");
            return (
              <button key={d} data-on={d === date} ref={(el) => { if (el && d === date && el.parentElement) el.parentElement.scrollLeft = Math.max(0, el.offsetLeft - 16); }} onClick={() => setDate(d)} className="select-card min-h-[64px] min-w-[58px] items-center px-2 text-center">
                <span className="text-xs text-muted capitalize">{dateLabel(dt, locale, { weekday: "short" })}</span>
                <span className="text-lg font-bold">{dateLabel(dt, locale, { day: "numeric" })}</span>
                <span className="text-[10px] text-muted">{dateLabel(dt, locale, { month: "short" })}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 min-h-24">
          {loadingSlots || !slots ? (
            <p className="text-sm text-muted">{tc("loading")}</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-muted">{t("noSlots")}</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {slots.map((s) => (
                <button key={s.time} data-on={s.time === time} onClick={() => { setTime(s.time); if (masterId && !s.masterIds.includes(masterId)) setMasterId(null); }} className="select-card min-h-11 min-w-0 items-center py-1 text-sm font-semibold">
                  {s.time}
                </button>
              ))}
            </div>
          )}
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
                  <button key={wd} data-on={on} disabled={locked} onClick={() => setWeekdays((w) => (on ? w.filter((x) => x !== wd) : [...w, wd].sort()))} className="select-card min-h-10 min-w-0 items-center px-0 text-sm font-semibold disabled:opacity-100">
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      {props.allowChooseMaster && props.masters.length > 0 && (
        <Section n={3} title={t("master")}>
          {!time && <p className="mb-2 text-sm text-muted">{t("chooseTimeFirst")}</p>}
          <div className="space-y-2">
            <button data-on={masterId === null} onClick={() => setMasterId(null)} className="select-card min-h-0 w-full flex-row items-center gap-3 py-3">
              <span className="grid size-11 place-items-center rounded-full bg-surface"><UsersRound size={20} /></span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">{t("anyMaster")}</span>
                <span className="block text-xs text-muted">{t("anyMasterSub")}</span>
              </span>
              {masterId === null && <Check size={18} />}
            </button>
            {props.masters.map((m) => {
              const free = !slot || slot.masterIds.includes(m.id);
              return (
                <button key={m.id} disabled={!time || !free} data-on={masterId === m.id} onClick={() => setMasterId(m.id)} className="select-card min-h-0 w-full flex-row items-center gap-3 py-3 disabled:opacity-50">
                  <img src={m.photo || "/img/master-1.svg"} alt="" className="size-11 rounded-full object-cover" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{m.name}</span>
                    <span className="block text-xs text-muted">
                      {time && !free ? t("masterBusy") : m.reviewsCount ? `★ ${m.rating.toFixed(1)} · ${tc("reviews", { count: m.reviewsCount })}` : tc("new")}
                      {m.experienceYears > 0 && ` · ${tc("yearsExp", { count: m.experienceYears })}`}
                    </span>
                  </span>
                  {masterId === m.id && <Check size={18} />}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      <Section n={props.allowChooseMaster && props.masters.length ? 4 : 3} title={t("payment")}>
        <div className="space-y-2">
          {props.cashEnabled && (
            <button data-on={payment === "CASH"} onClick={() => setPayment("CASH")} className="select-card min-h-0 w-full flex-row items-center gap-3 py-3">
              <Banknote size={20} />
              <span className="flex-1"><span className="block text-sm font-semibold">{t("cash")}</span><span className="block text-xs text-muted">{t("cashSub")}</span></span>
              {payment === "CASH" && <Check size={18} />}
            </button>
          )}
          <button disabled={!props.cardEnabled} data-on={payment === "CARD"} onClick={() => setPayment("CARD")} className="select-card min-h-0 w-full flex-row items-center gap-3 py-3 disabled:opacity-50">
            <CreditCard size={20} />
            <span className="flex-1 text-sm font-semibold">{t("card")}</span>
            {!props.cardEnabled && <span className="chip">{t("cardSoon")}</span>}
          </button>
        </div>

        <div className="mt-4">
          <label className="label flex items-center gap-1.5"><Tag size={15} /> {t("promo")}</label>
          <div className="flex gap-2">
            <input className="input uppercase" placeholder={t("promoPlaceholder")} value={promoInput} onChange={(e) => { setPromoInput(e.target.value); setPromoMsg(undefined); }} />
            {promo ? (
              <button className="btn-outline" onClick={() => { setPromo(null); setPromoInput(""); setPromoMsg(undefined); }}>{tc("remove")}</button>
            ) : (
              <button className="btn-dark" onClick={applyPromo} disabled={!promoInput.trim()}>{tc("apply")}</button>
            )}
          </div>
          {promoMsg && <p className={cn("mt-1.5 text-sm", promoMsg.ok ? "text-ok" : "text-bad")}>{promoMsg.text}</p>}
        </div>

        <div className="mt-4">
          <label className="label">{t("comment")} <span className="font-normal text-muted">({tc("optional")})</span></label>
          <textarea className="input min-h-20 py-2" placeholder={t("commentPlaceholder")} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
      </Section>

      <section className="py-5">
        <h2 className="mb-2 text-[17px] font-semibold">{t("summary")}</h2>
        <dl className="space-y-1.5 text-sm">
          {props.lines.filter((l) => l.price > 0).map((l, i) => (
            <div key={i} className="flex justify-between"><dt className="text-muted">{l.optionTitle}</dt><dd>{amd(l.price)}</dd></div>
          ))}
          {price.first.discount > 0 && (
            <div className="flex justify-between text-ok">
              <dt>{price.first.source.includes("promo") ? `${t("discountPromo")} ${promo?.code || ""}` : price.first.source === "first" ? t("discountFirst") : t("discountPlan")}{props.plan?.kind !== "ONE_TIME" && ` (${ts("firstVisit")})`}</dt>
              <dd>−{amd(price.first.discount)}</dd>
            </div>
          )}
          {props.plan?.kind === "PACKAGE" && (price.visits || 1) > 1 && (
            <div className="flex justify-between"><dt className="text-muted">{`${(price.visits || 1) - 1} × ${amd(price.regular.price)}`}</dt><dd>{amd(price.regular.price * ((price.visits || 1) - 1))}</dd></div>
          )}
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>{payNowLabel}</dt><dd>{amd(price.payNow)}</dd></div>
          {props.plan?.kind === "SUBSCRIPTION" && <p className="text-xs text-muted">{ts("thenPerVisit", { price: amd(price.regular.price) })}</p>}
        </dl>
        <p className="mt-4 text-xs text-muted">
          {t.rich("agree", {
            offer: (c) => <Link href="/p/offer" className="underline">{c}</Link>,
            cancel: (c) => <Link href="/p/cancellation" className="underline">{c}</Link>,
          })}
        </p>
        {error && <p className="mt-3 rounded-lg bg-bad-50 px-3 py-2 text-sm text-bad">{error}</p>}
      </section>

      <PriceBar
        price={price.payNow}
        strike={price.payNowBase}
        caption={time ? `${dateLabel(atYerevan(date, time), locale, { day: "numeric", month: "short", weekday: "short" })}, ${time}` : payNowLabel}
        action={<button className="btn-primary min-w-[150px]" disabled={pending} onClick={submit}>{t("confirm")}</button>}
      />

      <Sheet open={addrOpen} onClose={() => setAddrOpen(false)} title={t("addAddress")}>
        <AddressForm
          districts={props.districts}
          onSaved={(a) => {
            setAddresses((list) => [...list.map((x) => (a.isDefault ? { ...x, isDefault: false } : x)), a]);
            setAddressId(a.id);
            setAddrOpen(false);
          }}
        />
      </Sheet>
    </div>
  );
}
