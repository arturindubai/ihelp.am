import "server-only";
import { db } from "../db";
import { tr } from "@/i18n/locales";
import type { PriceLine, PricePlan } from "@/lib/pricing";

export type LText = string;

export async function getHome(locale: string) {
  const [categories, banners, services] = await Promise.all([
    db.category.findMany({ where: { active: true }, orderBy: { sort: "asc" }, include: { services: { where: { active: true }, orderBy: { sort: "asc" }, select: { slug: true } } } }),
    db.banner.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
    db.service.findMany({ where: { active: true, category: { active: true } }, orderBy: { sort: "asc" }, include: { groups: { where: { active: true, isDuration: true }, include: { options: { where: { active: true } } } }, plans: { where: { active: true } } } }),
  ]);
  return {
    categories: categories.map((c) => ({
      slug: c.slug,
      title: tr(c.title, locale),
      image: c.image,
      comingSoon: c.comingSoon,
      // если в категории одна услуга — ведём сразу в неё
      href: c.comingSoon ? null : c.services.length === 1 ? `/s/${c.services[0].slug}` : `/c/${c.slug}`,
    })),
    banners: banners.map((b) => ({ id: b.id, title: tr(b.title, locale), subtitle: tr(b.subtitle, locale), image: b.image, link: b.link, bg: b.bg, promoCode: b.promoCode })),
    services: services.map((s) => serviceCard(s, locale)),
  };
}

type SvcCardInput = {
  slug: string;
  title: unknown;
  subtitle: unknown;
  image: string | null;
  rating: number;
  reviewsCount: number;
  groups: { options: { price: number }[] }[];
  plans: { discountPercent: number }[];
};

export function serviceCard(s: SvcCardInput, locale: string) {
  const prices = s.groups.flatMap((g) => g.options.map((o) => o.price)).filter((p) => p > 0);
  return {
    slug: s.slug,
    title: tr(s.title, locale),
    subtitle: tr(s.subtitle, locale),
    image: s.image,
    rating: s.rating,
    reviewsCount: s.reviewsCount,
    fromPrice: prices.length ? Math.min(...prices) : 0,
    maxDiscount: Math.max(0, ...s.plans.map((p) => p.discountPercent)),
  };
}

export async function getCategory(slug: string, locale: string) {
  const c = await db.category.findFirst({
    where: { slug, active: true },
    include: { services: { where: { active: true }, orderBy: { sort: "asc" }, include: { groups: { where: { active: true, isDuration: true }, include: { options: { where: { active: true } } } }, plans: { where: { active: true } } } } },
  });
  if (!c) return null;
  return { slug: c.slug, title: tr(c.title, locale), description: tr(c.description, locale), comingSoon: c.comingSoon, services: c.services.map((s) => serviceCard(s, locale)) };
}

export async function loadServiceRaw(slug: string) {
  return db.service.findFirst({
    where: { slug, active: true },
    include: {
      category: true,
      groups: { where: { active: true }, orderBy: { sort: "asc" }, include: { options: { where: { active: true }, orderBy: { sort: "asc" } } } },
      plans: { where: { active: true }, orderBy: { sort: "asc" } },
    },
  });
}
export type ServiceRaw = NonNullable<Awaited<ReturnType<typeof loadServiceRaw>>>;

type I18nItem = { title?: unknown; body?: unknown; q?: unknown; a?: unknown; icon?: string };

/** Локализованная модель услуги для клиентских компонентов */
export function localizeService(s: ServiceRaw, locale: string) {
  const content = (s.content || {}) as { note?: I18nItem; benefits?: I18nItem[]; howItWorks?: I18nItem[]; faq?: I18nItem[]; policy?: unknown };
  return {
    id: s.id,
    slug: s.slug,
    title: tr(s.title, locale),
    subtitle: tr(s.subtitle, locale),
    description: tr(s.description, locale),
    image: s.image,
    bannerImage: s.bannerImage,
    rating: s.rating,
    reviewsCount: s.reviewsCount,
    category: { slug: s.category.slug, title: tr(s.category.title, locale) },
    groups: s.groups.map((g) => ({
      id: g.id,
      title: tr(g.title, locale),
      hint: tr(g.hint, locale),
      infoTitle: tr(g.infoTitle, locale),
      infoBody: tr(g.infoBody, locale),
      type: g.type,
      required: g.required,
      isDuration: g.isDuration,
      options: g.options.map((o) => ({
        id: o.id,
        title: tr(o.title, locale),
        subtitle: tr(o.subtitle, locale),
        badge: tr(o.badge, locale),
        price: o.price,
        durationMin: o.durationMin,
        discountable: o.discountable,
        isDefault: o.isDefault,
        schedule: ((o.schedule as { icon: string; title: unknown; minutes: number }[] | null) || []).map((x) => ({ icon: x.icon, title: tr(x.title, locale), minutes: x.minutes })),
      })),
    })),
    plans: s.plans.map((p) => ({
      id: p.id,
      kind: p.kind,
      title: tr(p.title, locale),
      subtitle: tr(p.subtitle, locale),
      badge: tr(p.badge, locale),
      discountPercent: p.discountPercent,
      intervalDays: p.intervalDays,
      visitsPerWeek: p.visitsPerWeek,
      packageVisits: p.packageVisits,
      validityDays: p.validityDays,
      isDefault: p.isDefault,
    })),
    note: content.note ? { title: tr(content.note.title, locale), body: tr(content.note.body, locale) } : null,
    benefits: (content.benefits || []).map((b) => ({ icon: b.icon || "check", title: tr(b.title, locale) })).filter((b) => b.title),
    howItWorks: (content.howItWorks || []).map((b) => ({ title: tr(b.title, locale), body: tr(b.body, locale) })).filter((b) => b.title),
    faq: (content.faq || []).map((b) => ({ q: tr(b.q, locale), a: tr(b.a, locale) })).filter((b) => b.q),
    policy: tr(content.policy, locale),
  };
}
export type ServiceView = ReturnType<typeof localizeService>;
export type GroupView = ServiceView["groups"][number];
export type PlanView = ServiceView["plans"][number];

/** Разбор выбранной конфигурации: проверка обязательных групп, линии цены, длительность */
export function resolveSelection(s: ServiceView, optionIds: string[], planId: string | null) {
  const chosen = new Set(optionIds);
  const lines: (PriceLine & { optionId: string; groupId: string })[] = [];
  for (const g of s.groups) {
    const picked = g.options.filter((o) => chosen.has(o.id));
    if (g.type === "SINGLE" && picked.length > 1) return { ok: false as const };
    if (g.required && picked.length === 0) return { ok: false as const };
    for (const o of picked) lines.push({ optionId: o.id, groupId: g.id, groupTitle: g.title, optionTitle: o.title, price: o.price, discountable: o.discountable, durationMin: o.durationMin });
  }
  const plan = s.plans.find((p) => p.id === planId) || (s.plans.length ? null : undefined);
  if (s.plans.length && !plan) return { ok: false as const };
  const pricePlan: PricePlan | null = plan ? { kind: plan.kind, discountPercent: plan.discountPercent, packageVisits: plan.packageVisits } : null;
  const durationMin = Math.max(30, lines.reduce((a, l) => a + l.durationMin, 0));
  return { ok: true as const, lines, plan: plan || null, pricePlan, durationMin };
}

export async function getServiceReviews(serviceId: string, take = 10) {
  return db.review.findMany({ where: { serviceId, status: "APPROVED" }, orderBy: { createdAt: "desc" }, take, include: { master: { select: { name: true, slug: true } } } });
}

export async function getMastersForService(serviceId: string) {
  return db.master.findMany({ where: { active: true, skills: { some: { id: serviceId } } }, orderBy: [{ sort: "asc" }] });
}

export async function recalcRatings(masterId?: string | null, serviceId?: string | null) {
  if (masterId) {
    const a = await db.review.aggregate({ where: { masterId, status: "APPROVED" }, _avg: { rating: true }, _count: true });
    await db.master.update({ where: { id: masterId }, data: { rating: a._avg.rating || 0, reviewsCount: a._count } });
  }
  if (serviceId) {
    const a = await db.review.aggregate({ where: { serviceId, status: "APPROVED" }, _avg: { rating: true }, _count: true });
    await db.service.update({ where: { id: serviceId }, data: { rating: a._avg.rating || 0, reviewsCount: a._count } });
  }
}
