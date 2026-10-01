"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Check, Info } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { calculatePrice, calculatePlanSavings, type PricingRules } from "@/lib/pricing";
import { amd, durationLabel, cn } from "@/lib/format";
import type { ServiceView } from "@/server/services/catalog";
import { Sheet } from "@/components/ui/Sheet";
import { Icon } from "@/components/Icon";
import { PriceBar } from "./PriceBar";
import { writeCart, clearCart } from "@/lib/cart";
import { addToCartAction, clearCartAction } from "@/server/actions/cart";

export function initialSelection(s: ServiceView, planKind?: string) {
  const opts: string[] = [];
  for (const g of s.groups) {
    const d = g.options.filter((o) => o.isDefault);
    if (g.type === "SINGLE") {
      const pick = d[0] || (g.required ? g.options[0] : undefined);
      if (pick) opts.push(pick.id);
    } else opts.push(...d.map((o) => o.id));
  }
  const byKind = planKind ? s.plans.find((p) => p.kind === planKind.toUpperCase()) : undefined;
  const plan = byKind || s.plans.find((p) => p.isDefault) || s.plans[0];
  return { opts, planId: plan?.id || null };
}

export function ServiceConfigurator({ s, rules, isFirstOrder, policy, initialPlan }: { s: ServiceView; rules: PricingRules; isFirstOrder: boolean; policy?: string; initialPlan?: string }) {
  const t = useTranslations("service");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const init = useMemo(() => initialSelection(s, initialPlan), [s, initialPlan]);
  const [opts, setOpts] = useState<string[]>(init.opts);
  const [planId, setPlanId] = useState<string | null>(init.planId);
  const [info, setInfo] = useState<{ title: string; body?: string; schedule?: ServiceView["groups"][number]["options"][number]["schedule"] } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const lines = s.groups.flatMap((g) => g.options.filter((o) => opts.includes(o.id)).map((o) => ({ groupTitle: g.title, optionTitle: o.title, price: o.price, discountable: o.discountable, durationMin: o.durationMin })));
  const complete = s.groups.every((g) => !g.required || g.options.some((o) => opts.includes(o.id))) && (!s.plans.length || !!planId);
  const plan = s.plans.find((p) => p.id === planId);
  const priceFor = (p?: (typeof s.plans)[number]) => calculatePrice({ lines, plan: p ? { kind: p.kind, discountPercent: p.discountPercent, packageVisits: p.packageVisits } : null, isFirstOrder, rules });
  const price = priceFor(plan);

  function toggle(groupId: string, optionId: string) {
    const g = s.groups.find((x) => x.id === groupId)!;
    setOpts((prev) => {
      if (g.type === "SINGLE") return [...prev.filter((id) => !g.options.some((o) => o.id === id)), optionId];
      return prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId];
    });
  }

  const durationOpt = s.groups.find((g) => g.isDuration)?.options.find((o) => opts.includes(o.id));
  let step = 0;

  let barLabel = "";
  let barCaption = "";
  if (plan?.kind === "SUBSCRIPTION") {
    if (price.first.price !== price.regular.price) {
      barLabel = t("firstVisit");
      barCaption = t("thenPerVisit", { price: amd(price.regular.price) });
    } else {
      barCaption = tc("perVisit");
    }
  } else if (plan?.kind === "PACKAGE") {
    barCaption = t("packTotal", { count: price.visits || 1 });
  }
  const barPrice = plan?.kind === "PACKAGE" ? price.payNow : price.first.price;
  const barStrike = plan?.kind === "PACKAGE" ? price.payNowBase : price.base;

  // Сохраняем выбор в localStorage и дебаунсированно на сервере
  useEffect(() => {
    if (lines.length > 0) {
      writeCart({ slug: s.slug, opts, planId, count: 1, total: barPrice, slugs: [s.slug] });
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        addToCartAction(s.id, opts, planId).catch(() => null);
      }, 800);
    } else {
      clearCart();
      clearTimeout(saveTimerRef.current);
      clearCartAction().catch(() => null);
    }
    return () => clearTimeout(saveTimerRef.current);
  }, [lines.length, opts, planId, barPrice, s.slug, s.id]);

  function go() {
    clearTimeout(saveTimerRef.current);
    addToCartAction(s.id, opts, planId).catch(() => null);
    router.push("/cart");
  }

  return (
    <div>
      <h2 className="h2 mt-6 mb-2">{t("selectRequirements")}</h2>

      {s.groups.map((g) => {
        step++;
        const selected = g.options.find((o) => opts.includes(o.id));

        // Длительности — сетка 3 колонки
        if (g.isDuration) {
          return (
            <section key={g.id} className="border-b border-line py-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-surface text-xs font-bold">{step}</span>
                <h3 className="h3">{g.title}</h3>
                {!g.required && <span className="text-xs text-muted">({tc("optional")})</span>}
              </div>
              {g.hint && <p className="-mt-2 mb-3 text-sm text-muted">{g.hint}</p>}
              <div className="grid grid-cols-3 gap-2">
                {g.options.map((o) => {
                  const on = opts.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      data-on={on}
                      onClick={() => toggle(g.id, o.id)}
                      className={cn(
                        "relative flex min-h-[80px] flex-col items-center justify-center rounded-xl border border-line bg-paper px-2 py-3 text-center transition",
                        on && "border-action bg-brand-50 ring-1 ring-action",
                      )}
                    >
                      {o.badge && <span className="absolute -top-2 right-1.5 rounded bg-badge px-1.5 py-px text-[10px] font-semibold text-on-badge">{o.badge}</span>}
                      <span className="text-[13px] font-semibold leading-tight">{o.title}</span>
                      {o.subtitle && <span className="mt-0.5 text-[11px] leading-tight text-muted">{o.subtitle}</span>}
                      <span className="mt-1.5 text-sm font-bold">{amd(o.price)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-4">
                {selected && selected.schedule.length > 0 && (
                  <button className="link text-sm" onClick={() => setInfo({ title: t("sampleTitle", { duration: durationLabel(selected.durationMin, locale) }), body: t("sampleSub"), schedule: selected.schedule })}>
                    {t("sampleSchedule")}
                  </button>
                )}
                {g.infoTitle && (
                  <button className="link text-sm" onClick={() => setInfo({ title: g.infoTitle, body: g.infoBody })}>
                    {g.infoTitle}
                  </button>
                )}
              </div>
            </section>
          );
        }

        // Мульти-выбор — вертикальный список с чекбоксами
        if (g.type === "MULTI") {
          return (
            <section key={g.id} className="border-b border-line py-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-surface text-xs font-bold">{step}</span>
                <h3 className="h3">{g.title}</h3>
                {!g.required && <span className="text-xs text-muted">({tc("optional")})</span>}
              </div>
              {g.hint && <p className="-mt-2 mb-3 text-sm text-muted">{g.hint}</p>}
              <div className="space-y-2">
                {g.options.map((o) => {
                  const on = opts.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      data-on={on}
                      onClick={() => toggle(g.id, o.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border border-line bg-paper px-3 py-3 text-left transition",
                        on && "border-action bg-brand-50 ring-1 ring-action",
                      )}
                    >
                      <span className={cn("grid size-5 shrink-0 place-items-center rounded border-2 transition", on ? "border-action bg-action text-on-action" : "border-line-strong")}>
                        {on && <Check size={12} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[14px] font-medium">{o.title}</span>
                          {o.badge && <span className="rounded bg-badge px-1.5 py-px text-[10px] font-semibold text-on-badge">{o.badge}</span>}
                        </span>
                        {o.subtitle && <span className="block text-xs text-muted">{o.subtitle}</span>}
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-muted">+ {amd(o.price)}</span>
                    </button>
                  );
                })}
              </div>
              {g.infoTitle && (
                <div className="mt-2">
                  <button className="link text-sm" onClick={() => setInfo({ title: g.infoTitle, body: g.infoBody })}>
                    {g.infoTitle}
                  </button>
                </div>
              )}
            </section>
          );
        }

        // SINGLE без isDuration — горизонтальный скролл карточек
        return (
          <section key={g.id} className="border-b border-line py-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-full bg-surface text-xs font-bold">{step}</span>
              <h3 className="h3">{g.title}</h3>
              {!g.required && <span className="text-xs text-muted">({tc("optional")})</span>}
            </div>
            {g.hint && <p className="-mt-2 mb-3 text-sm text-muted">{g.hint}</p>}
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pt-2 pb-1">
              {g.options.map((o) => {
                const on = opts.includes(o.id);
                return (
                  <button key={o.id} data-on={on} onClick={() => toggle(g.id, o.id)} className="select-card">
                    {o.badge && <span className="absolute -top-2 right-2 rounded bg-badge px-1.5 py-px text-[10px] font-semibold text-on-badge">{o.badge}</span>}
                    <span className="text-[13px] font-medium">{o.title}</span>
                    {o.subtitle && <span className="text-[11px] leading-tight text-muted">{o.subtitle}</span>}
                    <span className="mt-1 text-sm font-semibold">+ {amd(o.price)}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-4">
              {g.infoTitle && (
                <button className="link text-sm" onClick={() => setInfo({ title: g.infoTitle, body: g.infoBody })}>
                  {g.infoTitle}
                </button>
              )}
            </div>
          </section>
        );
      })}

      {s.plans.length > 0 && (
        <section className="py-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-surface text-xs font-bold">{step + 1}</span>
            <h3 className="h3">{t("frequency")}</h3>
          </div>
          <p className="mb-3 text-sm text-muted">{t("frequencyHint")}</p>
          <div className="space-y-2">
            {s.plans.map((p) => {
              const pr = priceFor(p);
              const on = p.id === planId;
              const saving = calculatePlanSavings({ lines, plan: { kind: p.kind, discountPercent: p.discountPercent, packageVisits: p.packageVisits }, isFirstOrder, rules });
              return (
                <button key={p.id} data-on={on} onClick={() => setPlanId(p.id)} className={cn("w-full flex-row items-center gap-3 rounded-xl border border-line bg-paper px-3 py-3 text-left transition", on && "border-action bg-brand-50 ring-1 ring-action")}>
                  <div className="flex items-center gap-3">
                    <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", on ? "border-action" : "border-line-strong")}>
                      {on && <span className="size-2.5 rounded-full bg-action" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[15px] font-semibold">{p.title}</span>
                        {p.badge && <span className="rounded bg-badge px-1.5 py-px text-[10px] font-semibold text-on-badge">{p.badge}</span>}
                      </span>
                      {p.subtitle && <span className="block text-xs text-muted">{p.subtitle}</span>}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[15px] font-semibold">{amd(p.kind === "PACKAGE" ? pr.payNow : pr.regular.price)}</span>
                      <span className="block text-[11px] text-muted">
                        {p.kind === "PACKAGE" ? t("packTotal", { count: pr.visits || 1 }) : tc("perVisit")}
                      </span>
                      {saving > 0 && (
                        <span className="block text-[11px] font-semibold text-ok">
                          {p.kind === "PACKAGE"
                            ? t("packageSaving", { amount: amd(saving) })
                            : t("perVisitSaving", { amount: amd(saving) })}
                        </span>
                      )}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Плашка скидки первого визита — процент берётся из реально применённой скидки выбранного тарифа */}
      {isFirstOrder && planId !== null && price.first.percent > 0 && (
        <div className="mt-2 flex items-start gap-2 rounded-2xl bg-ok-50 px-4 py-3">
          <Info size={16} className="mt-0.5 shrink-0 text-ok" />
          <div>
            <div className="text-sm font-semibold text-ok">{t("firstVisitBannerTitle")}</div>
            <div className="text-xs text-ok/80">{t("firstOffer", { percent: price.first.percent })}</div>
          </div>
        </div>
      )}

      {/* Условия */}
      {policy && (
        <section className="mt-6 border-t border-line pt-4">
          <h3 className="h3 mb-2">{t("policy")}</h3>
          <p className="text-sm whitespace-pre-line text-muted">{policy}</p>
        </section>
      )}

      {durationOpt && null}

      <PriceBar
        price={barPrice}
        strike={barStrike}
        label={complete ? barLabel : undefined}
        caption={complete ? barCaption : t("selectAll")}
        action={
          <button className="btn-primary min-w-[140px]" disabled={!complete} onClick={go}>
            {t("toCart")}
          </button>
        }
      />

      <Sheet open={!!info} onClose={() => setInfo(null)} title={info?.title}>
        {info?.body && <p className="mb-3 text-sm whitespace-pre-line text-muted">{info.body}</p>}
        {info?.schedule && (
          <ul className="divide-y divide-line">
            {info.schedule.map((x, i) => (
              <li key={i} className="flex items-center gap-3 py-3">
                <span className="grid size-9 place-items-center rounded-lg bg-surface">
                  <Icon name={x.icon} size={18} />
                </span>
                <span className="flex-1">{x.title}</span>
                <span className="text-sm text-muted">{durationLabel(x.minutes, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
