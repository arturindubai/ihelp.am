"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../../db";
import { requireSection } from "../../admin";
import { audit } from "../../audit";
import { normalizePhone } from "@/lib/phone";

const i18n = z.object({ ru: z.string().max(5000).optional(), en: z.string().max(5000).optional(), am: z.string().max(5000).optional() }).partial();
const time = z.string().regex(/^\d{2}:\d{2}$/);
const schema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,60}$/),
  name: i18n.refine((v) => !!v.ru?.trim()),
  bio: i18n.nullable().optional(),
  photo: z.string().max(500).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  experienceYears: z.number().int().min(0).max(80),
  languages: z.array(z.string().max(5)).max(10),
  workingHours: z.record(z.string(), z.array(z.tuple([time, time])).max(3)),
  active: z.boolean(),
  sort: z.number().int(),
  skills: z.array(z.string()).max(200),
  timeOff: z.array(z.object({ from: z.string(), to: z.string(), reason: z.string().max(200).nullable().optional() })).max(100),
});
export type MasterPayload = z.infer<typeof schema>;

export async function saveMasterAction(id: string | null, input: MasterPayload) {
  const u = await requireSection("masters");
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.path.join(".") };
  const d = p.data;
  const phone = d.phone ? normalizePhone(d.phone) : null;
  if (d.phone && !phone) return { ok: false as const, error: "phone" };
  const linkedUser = phone ? await db.user.findUnique({ where: { phone } }) : null;
  const data = {
    slug: d.slug, name: d.name, bio: d.bio ?? Prisma.DbNull, photo: d.photo ?? null, phone, experienceYears: d.experienceYears, languages: d.languages,
    workingHours: d.workingHours, active: d.active, sort: d.sort, skills: { set: d.skills.map((s) => ({ id: s })) },
    userId: linkedUser ? linkedUser.id : null,
  };
  try {
    const m = await db.$transaction(async (tx) => {
      if (linkedUser) await tx.master.updateMany({ where: { userId: linkedUser.id, ...(id ? { id: { not: id } } : {}) }, data: { userId: null } });
      const saved = id ? await tx.master.update({ where: { id }, data }) : await tx.master.create({ data: { ...data, skills: { connect: d.skills.map((s) => ({ id: s })) } } });
      await tx.timeOff.deleteMany({ where: { masterId: saved.id } });
      for (const t of d.timeOff) {
        const from = new Date(`${t.from}T00:00:00+04:00`), to = new Date(`${t.to}T23:59:59+04:00`);
        if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && to > from) await tx.timeOff.create({ data: { masterId: saved.id, from, to, reason: t.reason || null } });
      }
      if (linkedUser && linkedUser.role === "CLIENT") await tx.user.update({ where: { id: linkedUser.id }, data: { role: "MASTER" } });
      return saved;
    });
    await audit(u.id, id ? "master.update" : "master.create", "Master", m.id, { slug: d.slug });
    revalidatePath("/", "layout");
    return { ok: true as const, id: m.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false as const, error: "slug" };
    throw e;
  }
}

export async function deleteMasterAction(id: string) {
  const u = await requireSection("masters");
  const n = await db.visit.count({ where: { masterId: id } });
  if (n) {
    await db.master.update({ where: { id }, data: { active: false } });
    await audit(u.id, "master.archive", "Master", id);
    return { ok: true as const, archived: true };
  }
  await db.master.delete({ where: { id } });
  await audit(u.id, "master.delete", "Master", id);
  revalidatePath("/", "layout");
  return { ok: true as const, archived: false };
}
