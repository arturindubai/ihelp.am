"use client";
import { useLocale, useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { amd } from "@/lib/format";
import { tr } from "@/i18n/locales";
import { Card, I18nInput, NumInput, RowTools, Toggle, move } from "@/components/admin/fields";
import { calculatePrice, type PricingRules } from "@/lib/pricing";
import type { ServicePayload } from "@/server/actions/admin/catalog";

type P = ServicePayload["plans"][number];

export function PlansTab({
  s,
  up,
  setPlan,
  rules,
}: {
  s: ServicePayload;
  up: (patch: Partial<ServicePayload>) => void;
  setPlan: (pi: number, patch: Partial<P>) => void;
  rules: PricingRules;
}) {
  const t = useTranslations("admin");
  const locale = useLocale();

  const durGroup = s.groups.find((g) => g.isDuration);
  const sampleOpt = durGroup?.options.find((o) => o.isDefault) || durGroup?.options[0];

  return (
    <div className="space-y-3">
      {s.plans.length === 0 && (
        <p className="text-sm text-muted">{t("services.noPlans")}</p>
      )}

      {s.plans.map((p, pi) => {
        const pr = sampleOpt
          ? calculatePrice({
              lines: [{ groupTitle: "", optionTitle: "", price: sampleOpt.price, discountable: sampleOpt.discountable, durationMin: sampleOpt.durationMin }],
              plan: { kind: p.kind, discountPercent: p.discountPercent, packageVisits: p.packageVisits },
              rules,
            })
          : null;

        let priceText: string | null = null;
        if (pr && sampleOpt) {
          if (p.kind === "PACKAGE") {
            priceText = `${amd(pr.payNow)} итого (${pr.visits} × ${amd(pr.regular.price)})`;
          } else if (pr.regular.percent > 0) {
            priceText = `${amd(pr.regular.price)} (скидка ${pr.regular.percent}%)`;
          } else {
            priceText = amd(pr.regular.price);
          }
        }

        return (
          <Card
            key={p.id || `np${pi}`}
            title={`${tr(p.title, locale) || "—"} · ${t(`services.kinds.${p.kind}`)}`}
            actions={
              <RowTools
                onUp={pi ? () => up({ plans: move(s.plans, pi, -1) }) : undefined}
                onDown={pi < s.plans.length - 1 ? () => up({ plans: move(s.plans, pi, 1) }) : undefined}
                onDelete={() => confirm(t("common.deleteConfirm")) && up({ plans: s.plans.filter((_, i) => i !== pi) })}
              />
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <I18nInput label={t("common.title")} required value={p.title} onChange={(v) => setPlan(pi, { title: v })} />
              <I18nInput label={t("common.subtitle")} value={p.subtitle} onChange={(v) => setPlan(pi, { subtitle: v })} />
              <div>
                <label className="label">{t("services.planKind")}</label>
                <select className="input" value={p.kind} onChange={(e) => setPlan(pi, { kind: e.target.value as "ONE_TIME" })}>
                  {(["ONE_TIME", "SUBSCRIPTION", "PACKAGE"] as const).map((k) => (
                    <option key={k} value={k}>{t(`services.kinds.${k}`)}</option>
                  ))}
                </select>
              </div>
              <NumInput label={t("services.discount")} step={0.5} value={p.discountPercent} onChange={(v) => setPlan(pi, { discountPercent: v ?? 0 })} />
              {p.kind === "SUBSCRIPTION" && (
                <>
                  <NumInput label={t("services.intervalDays")} value={p.intervalDays} onChange={(v) => setPlan(pi, { intervalDays: v })} />
                  <NumInput label={t("services.visitsPerWeek")} value={p.visitsPerWeek} onChange={(v) => setPlan(pi, { visitsPerWeek: v })} />
                </>
              )}
              {p.kind === "PACKAGE" && (
                <>
                  <NumInput label={t("services.packageVisits")} value={p.packageVisits} onChange={(v) => setPlan(pi, { packageVisits: v })} />
                  <NumInput label={t("services.validityDays")} value={p.validityDays} onChange={(v) => setPlan(pi, { validityDays: v })} />
                </>
              )}
              <I18nInput label={t("common.badge")} value={p.badge} onChange={(v) => setPlan(pi, { badge: v })} />
              <div className="space-y-1">
                <Toggle label={t("common.active")} checked={p.active} onChange={(v) => setPlan(pi, { active: v })} />
                <Toggle
                  label={t("services.isDefault")}
                  checked={p.isDefault}
                  onChange={(v) =>
                    up({ plans: s.plans.map((x, i) => ({ ...x, isDefault: i === pi ? v : v ? false : x.isDefault })) })
                  }
                />
              </div>
            </div>

            {/* Блок цены для клиента */}
            <div className="mt-3 rounded-xl bg-brand-50 px-4 py-3">
              <p className="text-xs text-muted">{t("services.clientPriceLabel")}</p>
              {priceText ? (
                <p className="text-lg font-semibold text-ink">{priceText}</p>
              ) : (
                <p className="text-sm text-muted">{t("services.addDurationOption")}</p>
              )}
            </div>
          </Card>
        );
      })}

      <button
        type="button"
        className="btn-dark"
        onClick={() =>
          up({
            plans: [
              ...s.plans,
              { kind: "SUBSCRIPTION", title: {}, subtitle: null, badge: null, discountPercent: 0, intervalDays: 7, visitsPerWeek: null, packageVisits: null, validityDays: null, active: true, isDefault: false },
            ],
          })
        }
      >
        <Plus size={18} /> {t("services.addPlan")}
      </button>
    </div>
  );
}
