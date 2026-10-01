import "server-only";
import { db } from "../db";
import { tr } from "@/i18n/locales";

export type SearchResult = {
  slug: string;
  title: string;
  category: string;
  categorySlug: string;
  price: number | null;
  comingSoon: boolean;
  href: string;
};

export async function searchServices(q: string, locale: string): Promise<SearchResult[]> {
  if (q.length < 2) return [];

  const services = await db.service.findMany({
    where: {
      active: true,
      category: { active: true, archived: false },
    },
    include: {
      category: { select: { title: true, slug: true } },
      groups: {
        where: { active: true },
        include: { options: { where: { active: true }, select: { price: true } } },
      },
    },
    orderBy: { sort: "asc" },
    take: 50,
  });

  const lower = q.toLowerCase();
  const matched = services.filter((s) => {
    const title = tr(s.title, locale).toLowerCase();
    const subtitle = tr(s.subtitle, locale).toLowerCase();
    const description = tr(s.description, locale).toLowerCase();
    const catTitle = tr(s.category.title, locale).toLowerCase();
    return (
      title.includes(lower) ||
      subtitle.includes(lower) ||
      description.includes(lower) ||
      catTitle.includes(lower)
    );
  });

  return matched.slice(0, 8).map((s) => {
    const prices = s.groups
      .flatMap((g) => g.options.map((o) => o.price))
      .filter((p) => p > 0);
    const fromPrice = prices.length ? Math.min(...prices) : null;
    return {
      slug: s.slug,
      title: tr(s.title, locale),
      category: tr(s.category.title, locale),
      categorySlug: s.category.slug,
      price: fromPrice,
      comingSoon: s.comingSoon,
      // comingSoon → /s/<slug> тоже показывает форму «Уведомить меня»
      href: `/s/${s.slug}`,
    };
  });
}
