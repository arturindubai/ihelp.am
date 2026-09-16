"use client";
import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Check, Info } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { calculatePrice, type PricingRules } from "@/lib/pricing";
import { amd, durationLabel, cn } from "@/lib/format";
import type { ServiceView } from "@/server/services/catalog";
import { Sheet } from "@/components/ui/Sheet";
import { Icon } from "@/components/Icon";
import { PriceBar } from "./PriceBar";

export function initialSelection(s: ServiceView) {
  const opts: string[] = [];
  for (const g of s.groups) {
    const d = g.options.filter((o) => o.isDefault);
    if (g.type === "SINGLE") {
      const pick = d[0] || (g.required ? g.options[0] : undefined);
      if (pick) opts.push(pick.id);
    } else opts.push(...d.map((o) => o.id));
  }
  const plan = s.plans.find((p) => p.isDefault) || s.plans[0];
  return { opts, planId: plan?.id || null };
}

export function ServiceConfigurator({ s, rules, isFirstOrder }: { s: ServiceView; rules: PricingRules; isFirstOrder: boolean }) {
  const t = useTranslations("service");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const init = useMemo(() => initialSelection(s), [s]);
  const [opts, setOpts] = useState<string[]>(init.opts);
  const [planId, setPlanId] = useState<string | null>(init.planId);
  const [info, setInfo] = useState<{ title: string; body?: string; schedule?: ServiceView["groups"][number]["options"][number]["schedule"] } | null>(null);

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

  let caption = "";
  if (plan?.kind === "SUBSCRIPTION") caption = price.first.price !== price.regular.price ? `${t("firstVisit")} · ${t("thenPerVisit", { price: amd(price.regular.price) })}` : tc("perVisit");
  else if (plan?.kind === "PACKAGE") caption = t("packTotal", { count: price.visits || 1 });
  const barPrice = plan?.kind === "PACKAGE" ? price.payNow : price.first.price;
  const barStrike = plan?.kind === "PACKAGE" ? price.payNowBase : price.base;
  const committedPct = rules.firstVisitCommittedDiscount;

  function go() {
    const q = new URLSearchParams({ o: opts.join(","), ...(planId ? { p: planId } : {}) });
    router.push(`/book/${s.slug}?${q}`);
  }

  return (
    <div>
      <h2 className="h2 mt-6 mb-2">{t("selectRequirements")}</h2>

      {s.groups.map((g) => {
        step++;
        const selected = g.options.find((o) => opts.includes(o.id));
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
                    {o.badge && <span className="absolute -top-2 right-2 rounded bg-ok px-1.5 py-px text-[10px] font-semibold text-inverse">{o.badge}</span>}
                    <span className="flex items-center gap-1 text-[13px] font-medium">
                      {g.type === "MULTI" && <span className={cn("grid size-4 place-items-center rounded border", on ? "border-ink bg-ink text-inverse" : "border-line")}>{on && <Check size={12} />}</span>}
                      {o.title}
                    </span>
                    {o.subtitle && <span className="text-[11px] leading-tight text-muted">{o.subtitle}</span>}
                    <span className="mt-1 text-sm font-semibold">{g.isDuration ? amd(o.price) : `+ ${amd(o.price)}`}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-4">
              {g.isDuration && selected && selected.schedule.length > 0 && (
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
      })}

      {s.plans.length > 0 && (
        <section className="py-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-surface text-xs font-bold">{step + 1}</span>
            <h3 className="h3">{t("frequency")}</h3>
          </div>
          <p className="mb-3 text-sm text-muted">{t("frequencyHint")}</p>
          {isFirstOrder && committedPct > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-ok-50 px-3 py-2 text-sm text-ok">
              <Info size={16} className="shrink-0" /> {t("firstOffer", { percent: committedPct })}
            </div>
          )}
          <div className="space-y-2">
            {s.plans.map((p) => {
              const pr = priceFor(p);
              const on = p.id === planId;
              return (
                <button key={p.id} data-on={on} onClick={() => setPlanId(p.id)} className="select-card w-full flex-row items-center gap-3">
                  <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", on ? "border-ink" : "border-line")}>{on && <span className="size-2.5 rounded-full bg-ink" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[15px] font-semibold">{p.title}</span>
                      {p.badge && <span className="rounded bg-ok px-1.5 py-px text-[10px] font-semibold text-inverse">{p.badge}</span>}
                    </span>
                    {p.subtitle && <span className="block text-xs text-muted">{p.subtitle}</span>}
                  </span>
                  <span className="text-right">
                    <span className="block text-[15px] font-semibold">{amd(p.kind === "PACKAGE" ? pr.payNow : pr.regular.price)}</span>
                    <span className="block text-[11px] text-muted">
                      {p.kind === "PACKAGE" ? t("packTotal", { count: pr.visits || 1 }) : tc("perVisit")}
                      {p.discountPercent > 0 && <span className="ml-1 font-semibold text-ok">{tc("off", { percent: p.discountPercent })}</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {durationOpt && null}

      <PriceBar
        price={barPrice}
        strike={barStrike}
        caption={complete ? caption : t("selectAll")}
        action={
          <button className="btn-primary min-w-[140px]" disabled={!complete} onClick={go}>
            {tc("continue")}
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
