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

  const lower = q.toLowerCase();

  const [services, categories] = await Promise.all([
    db.service.findMany({
      where: {
        active: true,
        category: { active: true, archived: false },
      },
      include: {
        category: { select: { title: true, slug: true } },
        groups: {
          // Цена «от» считается только по группам длительности — иначе доплаты попадают в min()
          where: { active: true, isDuration: true },
          include: { options: { where: { active: true }, select: { price: true } } },
        },
      },
      orderBy: { sort: "asc" },
      take: 50,
    }),
    db.category.findMany({
      where: { active: true, archived: false },
      select: { slug: true, title: true, description: true, comingSoon: true },
      orderBy: { sort: "asc" },
    }),
  ]);

  const matchedServices = services.filter((s) => {
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

  const serviceResults: SearchResult[] = matchedServices.slice(0, 8).map((s) => {
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
      href: `/s/${s.slug}`,
    };
  });

  // Категории в результатах: slug не должен дублировать уже найденные категории услуг
  const coveredCategorySlugs = new Set(matchedServices.map((s) => s.category.slug));
  const matchedCategories = categories.filter((c) => {
    if (coveredCategorySlugs.has(c.slug)) return false;
    const title = tr(c.title, locale).toLowerCase();
    const desc = tr(c.description, locale).toLowerCase();
    return title.includes(lower) || desc.includes(lower);
  });

  const remaining = Math.max(0, 8 - serviceResults.length);
  const categoryResults: SearchResult[] = matchedCategories.slice(0, remaining).map((c) => ({
    slug: c.slug,
    title: tr(c.title, locale),
    category: tr(c.title, locale),
    categorySlug: c.slug,
    price: null,
    comingSoon: c.comingSoon,
    href: `/c/${c.slug}`,
  }));

  return [...serviceResults, ...categoryResults];
}

/** Логирует запрос, вернувший 0 результатов: upsert по (query, locale) с инкрементом count */
export async function logEmptySearch(q: string, locale: string): Promise<void> {
  const query = q.toLowerCase().trim();
  if (query.length < 2) return;
  try {
    await db.searchQuery.upsert({
      where: { query_locale: { query, locale } },
      create: { query, locale },
      update: { count: { increment: 1 }, lastAt: new Date() },
    });
  } catch {
    // Логирование не критично — молча пропускаем сбои
  }
}
