import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { pageUser } from "@/server/adminPage";
import { getSettings } from "@/server/settings";
import { tr } from "@/i18n/locales";
import { Forbidden } from "@/components/admin/ui";
import { ServiceEditor } from "@/components/admin/ServiceEditor";
import type { ServicePayload } from "@/server/actions/admin/catalog";

export default async function EditService({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await pageUser("services"))) return <Forbidden />;
  const s = await db.service.findUnique({ where: { id }, include: { groups: { orderBy: { sort: "asc" }, include: { options: { orderBy: { sort: "asc" } } } }, plans: { orderBy: { sort: "asc" } }, masters: { select: { id: true } } } });
  if (!s) notFound();
  const [cats, masters, settings] = await Promise.all([db.category.findMany({ orderBy: { sort: "asc" } }), db.master.findMany({ orderBy: { sort: "asc" } }), getSettings()]);
  type AnyI = Record<string, string>;
  const content = (s.content || {}) as Partial<ServicePayload["content"]>;
  const payload: ServicePayload = {
    slug: s.slug, categoryId: s.categoryId, title: s.title as AnyI, subtitle: s.subtitle as AnyI, description: s.description as AnyI, badge: s.badge as AnyI, image: s.image, bannerImage: s.bannerImage, active: s.active, sort: s.sort,
    groups: s.groups.map((g) => ({ id: g.id, title: g.title as AnyI, hint: g.hint as AnyI, infoTitle: g.infoTitle as AnyI, infoBody: g.infoBody as AnyI, type: g.type, required: g.required, isDuration: g.isDuration, active: g.active,
      options: g.options.map((o) => ({ id: o.id, title: o.title as AnyI, subtitle: o.subtitle as AnyI, badge: o.badge as AnyI, price: o.price, durationMin: o.durationMin, discountable: o.discountable, isDefault: o.isDefault, active: o.active, schedule: (o.schedule as ServicePayload["groups"][number]["options"][number]["schedule"]) || [] })) })),
    plans: s.plans.map((p) => ({ id: p.id, kind: p.kind, title: p.title as AnyI, subtitle: p.subtitle as AnyI, badge: p.badge as AnyI, discountPercent: p.discountPercent, intervalDays: p.intervalDays, visitsPerWeek: p.visitsPerWeek, packageVisits: p.packageVisits, validityDays: p.validityDays, active: p.active, isDefault: p.isDefault })),
    content: { note: content.note || { title: {}, body: {} }, benefits: content.benefits || [], howItWorks: content.howItWorks || [], faq: content.faq || [], policy: content.policy || {} },
    masterIds: s.masters.map((m) => m.id),
  };
  return (
    <ServiceEditor
      id={s.id}
      initial={payload}
      categories={cats.map((c) => ({ id: c.id, title: tr(c.title, locale) }))}
      masters={masters.map((m) => ({ id: m.id, name: tr(m.name, locale), active: m.active }))}
      rules={settings.pricing}
    />
  );
}
