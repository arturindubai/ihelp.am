import { db } from "../db";
import { tr } from "@/i18n/locales";

export type AdminCatalogSection = {
  id: string;
  title: Record<string, string>;
  sort: number;
};

export type AdminCatalogCategory = {
  id: string;
  slug: string;
  title: Record<string, string>;
  description: Record<string, string> | null;
  image: string | null;
  sort: number;
  active: boolean;
  comingSoon: boolean;
  archived: boolean;
  showFormats: boolean;
  demandCount: number;
  sections: AdminCatalogSection[];
  services: AdminCatalogService[];
};

export type AdminCatalogService = {
  id: string;
  slug: string;
  title: string;
  image: string | null;
  active: boolean;
  comingSoon: boolean;
  sort: number;
  orders: number;
  rating: number;
  reviews: number;
  minPrice: number | null;
  demandCount: number;
  sectionId: string | null;
  hasNoPrice: boolean;
};

export async function getAdminCatalog(locale: string): Promise<AdminCatalogCategory[]> {
  const [cats, demandRows] = await Promise.all([
    db.category.findMany({
      orderBy: { sort: "asc" },
      include: {
        sections: { orderBy: { sort: "asc" } },
        services: {
          orderBy: { sort: "asc" },
          include: {
            groups: {
              where: { active: true },
              include: {
                options: {
                  where: { active: true },
                  orderBy: { price: "asc" },
                  take: 1,
                },
              },
            },
            plans: { where: { active: true }, select: { id: true } },
          },
        },
      },
    }),
    db.serviceInterest.groupBy({
      by: ["serviceSlug", "kind"],
      _count: { _all: true },
    }),
  ]);

  const catDemand = new Map<string, number>();
  const svcDemand = new Map<string, number>();
  for (const row of demandRows) {
    if (row.kind === "category") catDemand.set(row.serviceSlug, row._count._all);
    else svcDemand.set(row.serviceSlug, row._count._all);
  }

  return cats.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title as Record<string, string>,
    description: (c.description as Record<string, string>) || null,
    image: c.image,
    sort: c.sort,
    active: c.active,
    comingSoon: c.comingSoon,
    archived: c.archived,
    showFormats: c.showFormats,
    demandCount: catDemand.get(c.slug) ?? 0,
    sections: c.sections.map((s) => ({
      id: s.id,
      title: s.title as Record<string, string>,
      sort: s.sort,
    })),
    services: c.services.map((s) => {
      const prices = s.groups.flatMap((g) => g.options.map((o) => o.price));
      const minPrice = prices.length ? Math.min(...prices) : null;
      const hasNoPrice = prices.filter((p) => p > 0).length === 0 && s.plans.length === 0;
      return {
        id: s.id,
        slug: s.slug,
        title: tr(s.title, locale),
        image: s.image,
        active: s.active,
        comingSoon: s.comingSoon,
        sort: s.sort,
        orders: s.bookingsCount,
        rating: s.rating,
        reviews: s.reviewsCount,
        minPrice,
        demandCount: svcDemand.get(s.slug) ?? 0,
        sectionId: s.sectionId,
        hasNoPrice,
      };
    }),
  }));
}
