"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../../db";
import { requireSection } from "../../admin";
import { audit } from "../../audit";

const i18n = z.object({ ru: z.string().max(5000).optional(), en: z.string().max(5000).optional(), am: z.string().max(5000).optional() }).partial();
const i18nReq = i18n.refine((v) => !!v.ru?.trim(), { message: "ru required" });
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,80}$/);
const img = z.string().max(500).nullable().optional();
const J = (v: unknown) => (v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue));

const revalidateAll = () => revalidatePath("/", "layout");

export async function saveCategoryAction(input: unknown) {
  const u = await requireSection("services");
  const p = z.object({ id: z.string().optional(), slug, title: i18nReq, description: i18n.nullable().optional(), image: img, sort: z.number().int(), active: z.boolean(), comingSoon: z.boolean() }).safeParse(input);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.path.join(".") };
  const { id, ...d } = p.data;
  const data = { ...d, description: J(d.description) };
  try {
    const c = id ? await db.category.update({ where: { id }, data }) : await db.category.create({ data });
    await audit(u.id, id ? "category.update" : "category.create", "Category", c.id, d);
    revalidateAll();
    return { ok: true as const, id: c.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false as const, error: "slug" };
    throw e;
  }
}

export async function deleteCategoryAction(id: string) {
  const u = await requireSection("services");
  const n = await db.service.count({ where: { categoryId: id } });
  if (n) return { ok: false as const, error: "has_services" };
  await db.category.delete({ where: { id } });
  await audit(u.id, "category.delete", "Category", id);
  revalidateAll();
  return { ok: true as const };
}

export async function createServiceAction(categoryId: string) {
  const u = await requireSection("services");
  const base = `service-${Date.now().toString(36)}`;
  const s = await db.service.create({
    data: {
      categoryId, slug: base, title: { ru: "Новая услуга" }, active: false, sort: 99,
      groups: { create: [{ title: { ru: "Выберите длительность" }, isDuration: true, sort: 0, options: { create: [{ title: { ru: "1 ч" }, price: 0, durationMin: 60, isDefault: true }] } }] },
      plans: { create: [{ kind: "ONE_TIME", title: { ru: "Разово" }, isDefault: true }] },
    },
  });
  await audit(u.id, "service.create", "Service", s.id);
  return { ok: true as const, id: s.id };
}

const scheduleRow = z.object({ icon: z.string().max(30), title: i18n.optional().default({}), minutes: z.number().int().min(0).max(1000) });
const optionSchema = z.object({ id: z.string().optional(), title: i18nReq, subtitle: i18n.nullable().optional(), badge: i18n.nullable().optional(), price: z.number().int().min(0).max(10_000_000), durationMin: z.number().int().min(0).max(24 * 60), discountable: z.boolean(), isDefault: z.boolean(), active: z.boolean(), schedule: z.array(scheduleRow).max(30) });
const groupSchema = z.object({ id: z.string().optional(), title: i18nReq, hint: i18n.nullable().optional(), infoTitle: i18n.nullable().optional(), infoBody: i18n.nullable().optional(), type: z.enum(["SINGLE", "MULTI"]), required: z.boolean(), isDuration: z.boolean(), active: z.boolean(), options: z.array(optionSchema).max(60) });
const planSchema = z.object({ id: z.string().optional(), kind: z.enum(["ONE_TIME", "SUBSCRIPTION", "PACKAGE"]), title: i18nReq, subtitle: i18n.nullable().optional(), badge: i18n.nullable().optional(), discountPercent: z.number().min(0).max(100), intervalDays: z.number().int().min(1).max(365).nullable(), visitsPerWeek: z.number().int().min(1).max(7).nullable(), packageVisits: z.number().int().min(1).max(100).nullable(), validityDays: z.number().int().min(1).max(3650).nullable(), active: z.boolean(), isDefault: z.boolean() });
const serviceSchema = z.object({
  slug, categoryId: z.string(), title: i18nReq, subtitle: i18n.nullable().optional(), description: i18n.nullable().optional(), badge: i18n.nullable().optional(), image: img, bannerImage: img, active: z.boolean(), sort: z.number().int(),
  groups: z.array(groupSchema).max(20), plans: z.array(planSchema).max(20),
  content: z.object({ note: z.object({ title: i18n.optional(), body: i18n.optional() }).optional(), benefits: z.array(z.object({ icon: z.string().max(30), title: i18n.optional() })).max(20), howItWorks: z.array(z.object({ title: i18n.optional(), body: i18n.optional() })).max(20), faq: z.array(z.object({ q: i18n.optional(), a: i18n.optional() })).max(50), policy: i18n.optional() }),
  masterIds: z.array(z.string()).max(500),
});
export type ServicePayload = z.infer<typeof serviceSchema>;

export async function saveServiceAction(id: string, input: ServicePayload) {
  const u = await requireSection("services");
  const p = serviceSchema.safeParse(input);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.path.join(".") + ": " + p.error.issues[0]?.message };
  const d = p.data;
  try {
    await db.$transaction(async (tx) => {
      await tx.service.update({
        where: { id },
        data: { slug: d.slug, categoryId: d.categoryId, title: d.title, subtitle: J(d.subtitle), description: J(d.description), badge: J(d.badge), image: d.image ?? null, bannerImage: d.bannerImage ?? null, active: d.active, sort: d.sort, content: d.content as Prisma.InputJsonValue, masters: { set: d.masterIds.map((m) => ({ id: m })) } },
      });
      // Группы и варианты
      const keepGroups = d.groups.map((g) => g.id).filter(Boolean) as string[];
      await tx.optionGroup.deleteMany({ where: { serviceId: id, id: { notIn: keepGroups } } });
      for (const [gi, g] of d.groups.entries()) {
        const gData = { title: g.title, hint: J(g.hint), infoTitle: J(g.infoTitle), infoBody: J(g.infoBody), type: g.type, required: g.required, isDuration: g.isDuration, active: g.active, sort: gi };
        const group = g.id ? await tx.optionGroup.update({ where: { id: g.id, serviceId: id }, data: gData }) : await tx.optionGroup.create({ data: { ...gData, serviceId: id } });
        const keepOpts = g.options.map((o) => o.id).filter(Boolean) as string[];
        await tx.option.deleteMany({ where: { groupId: group.id, id: { notIn: keepOpts } } });
        for (const [oi, o] of g.options.entries()) {
          const oData = { title: o.title, subtitle: J(o.subtitle), badge: J(o.badge), price: o.price, durationMin: o.durationMin, discountable: o.discountable, isDefault: o.isDefault, active: o.active, schedule: o.schedule.length ? (o.schedule as Prisma.InputJsonValue) : Prisma.DbNull, sort: oi };
          if (o.id) await tx.option.update({ where: { id: o.id }, data: { ...oData, groupId: group.id } });
          else await tx.option.create({ data: { ...oData, groupId: group.id } });
        }
      }
      // Тарифы
      const keepPlans = d.plans.map((x) => x.id).filter(Boolean) as string[];
      await tx.plan.deleteMany({ where: { serviceId: id, id: { notIn: keepPlans } } });
      for (const [pi, pl] of d.plans.entries()) {
        const pData = { kind: pl.kind, title: pl.title, subtitle: J(pl.subtitle), badge: J(pl.badge), discountPercent: pl.discountPercent, intervalDays: pl.kind === "SUBSCRIPTION" ? pl.intervalDays || 7 : null, visitsPerWeek: pl.kind === "SUBSCRIPTION" ? pl.visitsPerWeek : null, packageVisits: pl.kind === "PACKAGE" ? pl.packageVisits || 1 : null, validityDays: pl.kind === "PACKAGE" ? pl.validityDays : null, active: pl.active, isDefault: pl.isDefault, sort: pi };
        if (pl.id) await tx.plan.update({ where: { id: pl.id, serviceId: id }, data: pData });
        else await tx.plan.create({ data: { ...pData, serviceId: id } });
      }
    }, { timeout: 30_000 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false as const, error: "slug" };
    throw e;
  }
  await audit(u.id, "service.update", "Service", id, { slug: d.slug });
  revalidateAll();
  return { ok: true as const };
}

export async function toggleServiceAction(id: string, active: boolean) {
  const u = await requireSection("services");
  await db.service.update({ where: { id }, data: { active } });
  await audit(u.id, "service.toggle", "Service", id, { active });
  revalidateAll();
  return { ok: true };
}

export async function deleteServiceAction(id: string) {
  const u = await requireSection("services");
  const n = await db.order.count({ where: { serviceId: id } });
  if (n) {
    await db.service.update({ where: { id }, data: { active: false } });
    await audit(u.id, "service.archive", "Service", id);
    revalidateAll();
    return { ok: true as const, archived: true };
  }
  await db.review.updateMany({ where: { serviceId: id }, data: { serviceId: null } });
  await db.service.delete({ where: { id } });
  await audit(u.id, "service.delete", "Service", id);
  revalidateAll();
  return { ok: true as const, archived: false };
}

export async function duplicateServiceAction(id: string) {
  const u = await requireSection("services");
  const s = await db.service.findUniqueOrThrow({ where: { id }, include: { groups: { include: { options: true } }, plans: true, masters: { select: { id: true } } } });
  const title = s.title as Record<string, string>;
  const copy = await db.service.create({
    data: {
      categoryId: s.categoryId, slug: `${s.slug}-copy-${Date.now().toString(36)}`, title: { ...title, ru: `${title.ru} (копия)` },
      subtitle: J(s.subtitle), description: J(s.description), badge: J(s.badge), image: s.image, bannerImage: s.bannerImage, content: J(s.content), active: false, sort: s.sort + 1,
      masters: { connect: s.masters },
      groups: { create: s.groups.map((g) => ({ title: g.title as Prisma.InputJsonValue, hint: J(g.hint), infoTitle: J(g.infoTitle), infoBody: J(g.infoBody), type: g.type, required: g.required, isDuration: g.isDuration, active: g.active, sort: g.sort, options: { create: g.options.map((o) => ({ title: o.title as Prisma.InputJsonValue, subtitle: J(o.subtitle), badge: J(o.badge), price: o.price, durationMin: o.durationMin, discountable: o.discountable, isDefault: o.isDefault, schedule: J(o.schedule), active: o.active, sort: o.sort })) } })) },
      plans: { create: s.plans.map(({ id: _i, serviceId: _s, ...pl }) => ({ ...pl, title: pl.title as Prisma.InputJsonValue, subtitle: J(pl.subtitle), badge: J(pl.badge) })) },
    },
  });
  await audit(u.id, "service.duplicate", "Service", copy.id, { from: id });
  return { ok: true as const, id: copy.id };
}
