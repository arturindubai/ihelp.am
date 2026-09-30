import "server-only";
import { db } from "../db";
import { tr } from "@/i18n/locales";

export type PriceRow = {
  optionId: string;
  categoryId: string;
  categoryTitle: string;
  sectionId: string | null;
  sectionTitle: string | null;
  serviceId: string;
  serviceTitle: string;
  groupTitle: string;
  optionTitle: string;
  price: number;
};

export type PriceAuditRow = {
  id: string;
  userId: string | null;
  userName: string | null;
  optionId: string;
  optionTitle: string;
  serviceId: string;
  serviceTitle: string;
  oldPrice: number;
  newPrice: number;
  createdAt: Date;
};

export type PriceAuditFilter = {
  serviceId?: string;
  from?: Date;
  to?: Date;
};

export type ServiceOption = { id: string; title: string };

export async function getPriceAuditLog(
  filter: PriceAuditFilter = {},
): Promise<{ rows: PriceAuditRow[]; total: number }> {
  const where = {
    ...(filter.serviceId ? { serviceId: filter.serviceId } : {}),
    ...(filter.from || filter.to
      ? {
          createdAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lte: filter.to } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.priceAudit.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
    db.priceAudit.count({ where }),
  ]);
  return { rows, total };
}

export async function getPriceAuditServices(): Promise<ServiceOption[]> {
  const rows = await db.priceAudit.findMany({
    select: { serviceId: true, serviceTitle: true },
    distinct: ["serviceId"],
    orderBy: { serviceTitle: "asc" },
  });
  return rows.map((r) => ({ id: r.serviceId, title: r.serviceTitle }));
}

export async function getPricesData(locale: string): Promise<{ rows: PriceRow[]; serviceCount: number }> {
  const cats = await db.category.findMany({
    orderBy: { sort: "asc" },
    include: {
      sections: { orderBy: { sort: "asc" } },
      services: {
        orderBy: [{ sectionId: "asc" }, { sort: "asc" }],
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
    const sectionMap = new Map(cat.sections.map((s) => [s.id, tr(s.title, locale)]));
    for (const svc of cat.services) {
      const svcTitle = tr(svc.title, locale);
      const sectionId = svc.sectionId ?? null;
      const sectionTitle = sectionId ? (sectionMap.get(sectionId) ?? null) : null;
      for (const group of svc.groups) {
        const groupTitle = tr(group.title, locale);
        for (const opt of group.options) {
          serviceIds.add(svc.id);
          rows.push({
            optionId: opt.id,
            categoryId: cat.id,
            categoryTitle: catTitle,
            sectionId,
            sectionTitle,
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
