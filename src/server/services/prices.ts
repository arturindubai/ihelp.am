import "server-only";
import { db } from "../db";
import { tr } from "@/i18n/locales";

export type PriceRow = {
  optionId: string;
  categoryId: string;
  categoryTitle: string;
  serviceId: string;
  serviceTitle: string;
  groupTitle: string;
  optionTitle: string;
  price: number;
};

export async function getPricesData(locale: string): Promise<{ rows: PriceRow[]; serviceCount: number }> {
  const cats = await db.category.findMany({
    orderBy: { sort: "asc" },
    include: {
      services: {
        orderBy: { sort: "asc" },
        include: {
          groups: {
            orderBy: { sort: "asc" },
            include: { options: { orderBy: { sort: "asc" } } },
          },
        },
      },
    },
  });

  const rows: PriceRow[] = [];
  const serviceIds = new Set<string>();

  for (const cat of cats) {
    const catTitle = tr(cat.title, locale);
    for (const svc of cat.services) {
      const svcTitle = tr(svc.title, locale);
      for (const group of svc.groups) {
        const groupTitle = tr(group.title, locale);
        for (const opt of group.options) {
          serviceIds.add(svc.id);
          rows.push({
            optionId: opt.id,
            categoryId: cat.id,
            categoryTitle: catTitle,
            serviceId: svc.id,
            serviceTitle: svcTitle,
            groupTitle: groupTitle,
            optionTitle: tr(opt.title, locale),
            price: opt.price,
          });
        }
      }
    }
  }

  return { rows, serviceCount: serviceIds.size };
}
