/**
 * Движок цены. Чистая функция — одинаково считает на витрине, в корзине и на сервере при создании заказа.
 *
 * Правила (настраиваются в админке → Настройки → Цены и скидки):
 * - Скидки применяются только к «дисконтируемой» части (сама уборка). Материалы и допуслуги — без скидок.
 * - Тариф (частота / пакет) даёт свою скидку на каждый визит.
 * - Скидка на первый заказ: повышенная при обязательстве (подписка или пакет от N визитов), иначе базовая.
 * - Скидки не суммируются: берётся самая выгодная. Промокод с флагом «суммируется» применяется поверх.
 * - Промокод действует на первый оплачиваемый визит.
 * - Цена округляется до шага (по умолчанию 50 AMD).
 */

export type PlanKind = "ONE_TIME" | "SUBSCRIPTION" | "PACKAGE";

export interface PriceLine {
  groupTitle: string;
  optionTitle: string;
  price: number;
  discountable: boolean;
  durationMin: number;
}

export interface PricePlan {
  kind: PlanKind;
  discountPercent: number;
  packageVisits?: number | null;
}

export interface PricePromo {
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  maxDiscount?: number | null;
  stackable?: boolean;
}

export interface PricingRules {
  roundTo: number;
  firstVisitDiscount: number;
  firstVisitCommittedDiscount: number;
  commitmentMinVisits: number;
  stackDiscounts: boolean;
}

export type DiscountSource = "none" | "plan" | "first" | "promo" | "plan+promo" | "first+promo";

export interface VisitPrice {
  base: number;
  price: number;
  discount: number;
  percent: number;
  source: DiscountSource;
}

export interface PriceResult {
  discountableBase: number;
  extras: number;
  base: number;
  durationMin: number;
  visits: number | null;
  regular: VisitPrice;
  first: VisitPrice;
  promoApplied: boolean;
  promoDiscount: number;
  /** Сумма к оплате сейчас: разово — визит; пакет — весь пакет; подписка — первый визит */
  payNow: number;
  /** Цена без скидок за тот же объём (для зачёркнутой цены) */
  payNowBase: number;
  savingsPercent: number;
}

export const DEFAULT_RULES: PricingRules = {
  roundTo: 50,
  firstVisitDiscount: 10,
  firstVisitCommittedDiscount: 25,
  commitmentMinVisits: 4,
  stackDiscounts: false,
};

const roundTo = (v: number, step: number) => (step > 1 ? Math.round(v / step) * step : Math.round(v));

export function isCommitted(plan: PricePlan | null | undefined, rules: PricingRules) {
  if (!plan) return false;
  if (plan.kind === "SUBSCRIPTION") return true;
  if (plan.kind === "PACKAGE") return (plan.packageVisits || 0) >= rules.commitmentMinVisits;
  return false;
}

function promoAmount(promo: PricePromo, amount: number) {
  let d = promo.type === "PERCENT" ? (amount * promo.value) / 100 : promo.value;
  if (promo.maxDiscount) d = Math.min(d, promo.maxDiscount);
  return Math.max(0, Math.min(d, amount));
}

export function calculatePrice(input: {
  lines: PriceLine[];
  plan?: PricePlan | null;
  isFirstOrder?: boolean;
  promo?: PricePromo | null;
  rules?: Partial<PricingRules>;
}): PriceResult {
  const rules = { ...DEFAULT_RULES, ...(input.rules || {}) };
  const plan = input.plan || { kind: "ONE_TIME" as PlanKind, discountPercent: 0 };
  const discountableBase = input.lines.filter((l) => l.discountable).reduce((s, l) => s + l.price, 0);
  const extras = input.lines.filter((l) => !l.discountable).reduce((s, l) => s + l.price, 0);
  const base = discountableBase + extras;
  const durationMin = input.lines.reduce((s, l) => s + (l.durationMin || 0), 0);

  const planPct = Math.max(0, plan.discountPercent || 0);
  const regularService = roundTo(discountableBase * (1 - planPct / 100), rules.roundTo);
  const regular: VisitPrice = {
    base,
    price: regularService + extras,
    discount: discountableBase - regularService,
    percent: planPct,
    source: planPct > 0 ? "plan" : "none",
  };

  // Первый визит
  let firstPct = planPct;
  let firstSource: DiscountSource = planPct > 0 ? "plan" : "none";
  if (input.isFirstOrder) {
    const fd = isCommitted(plan, rules) ? rules.firstVisitCommittedDiscount : rules.firstVisitDiscount;
    if (fd > firstPct) {
      firstPct = fd;
      firstSource = "first";
    }
  }
  const afterAuto = roundTo(discountableBase * (1 - firstPct / 100), rules.roundTo);
  let firstService = afterAuto;
  let promoApplied = false;
  let promoDiscount = 0;

  if (input.promo) {
    const promo = input.promo;
    if (rules.stackDiscounts || promo.stackable) {
      const d = promoAmount(promo, afterAuto);
      firstService = roundTo(afterAuto - d, rules.roundTo);
      promoDiscount = afterAuto - firstService;
      promoApplied = promoDiscount > 0;
      if (promoApplied) firstSource = firstSource === "none" ? "promo" : (`${firstSource}+promo` as DiscountSource);
    } else {
      const withPromo = roundTo(discountableBase - promoAmount(promo, discountableBase), rules.roundTo);
      if (withPromo < afterAuto) {
        firstService = withPromo;
        promoDiscount = discountableBase - withPromo;
        promoApplied = true;
        firstSource = "promo";
      }
    }
  }

  const firstDiscount = discountableBase - firstService;
  const first: VisitPrice = {
    base,
    price: firstService + extras,
    discount: firstDiscount,
    percent: discountableBase ? Math.round((firstDiscount / discountableBase) * 100) : 0,
    source: firstDiscount > 0 ? firstSource : "none",
  };

  let visits: number | null = 1;
  let payNow = first.price;
  let payNowBase = base;
  if (plan.kind === "PACKAGE") {
    visits = Math.max(1, plan.packageVisits || 1);
    payNow = first.price + regular.price * (visits - 1);
    payNowBase = base * visits;
  } else if (plan.kind === "SUBSCRIPTION") {
    visits = null;
  }

  return {
    discountableBase,
    extras,
    base,
    durationMin,
    visits,
    regular,
    first,
    promoApplied,
    promoDiscount,
    payNow,
    payNowBase,
    savingsPercent: payNowBase ? Math.round(((payNowBase - payNow) / payNowBase) * 100) : 0,
  };
}
