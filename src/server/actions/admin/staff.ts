"use server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../../db";
import { requireSection } from "../../admin";
import { audit } from "../../audit";
import { normalizePhone } from "@/lib/phone";
import { normalizeEmail } from "@/lib/email";
import { DELEGATABLE_SECTIONS, type Section } from "@/lib/adminAccess";
import { revalidatePath } from "next/cache";

const DELEGATABLE_SET = new Set<string>(DELEGATABLE_SECTIONS);

const permissionsSchema = z.object({
  added: z.array(z.string()).transform((arr) => arr.filter((s) => DELEGATABLE_SET.has(s)) as Section[]),
  removed: z.array(z.string()).transform((arr) => arr.filter((s) => DELEGATABLE_SET.has(s)) as Section[]),
});

/** Обновить дельту прав конкретного сотрудника. Завершает все его сессии при изменении. */
export async function saveStaffPermissionsAction(userId: string, payload: { added: string[]; removed: string[] }) {
  const me = await requireSection("staff");
  if (!userId) return { ok: false as const, error: "invalid" };

  const parsed = permissionsSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "invalid" };

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false as const, error: "notfound" };
  if (target.id === me.id) return { ok: false as const, error: "self" };
  if (target.role !== "OPERATOR" && target.role !== "ADMIN") return { ok: false as const, error: "invalid_role" };

  const delta = { added: parsed.data.added, removed: parsed.data.removed };
  await db.user.update({ where: { id: userId }, data: { sectionDelta: delta } });
  await db.session.deleteMany({ where: { userId } });
  await audit(me.id, "staff.permissions", "User", userId, delta);
  revalidatePath("/", "layout");
  return { ok: true as const };
}

const loginSchema = z.object({
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  telegramId: z.string().nullable().optional(),
});

/** Обновить способы входа сотрудника (телефон, почта, Telegram).
 *  Цель — только OPERATOR, ADMIN, MASTER; способы входа OWNER меняет только сам.
 *  При смене телефона или почты сессии цели завершаются.
 */
export async function saveStaffLoginAction(userId: string, payload: { phone?: string | null; email?: string | null; telegramId?: string | null }) {
  const me = await requireSection("staff");
  if (!userId) return { ok: false as const, error: "invalid" };

  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "invalid" };

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false as const, error: "notfound" };
  if (target.role !== "OPERATOR" && target.role !== "ADMIN" && target.role !== "MASTER") {
    return { ok: false as const, error: "invalid_role" };
  }

  const data: Record<string, unknown> = {};
  let terminateSessions = false;

  if (parsed.data.phone !== undefined) {
    if (parsed.data.phone === null || parsed.data.phone.trim() === "") {
      // Телефон — уникальный идентификатор, пустым быть не может
      return { ok: false as const, error: "phone_required" };
    }
    const phone = normalizePhone(parsed.data.phone);
    if (!phone) return { ok: false as const, error: "phone_invalid" };
    data.phone = phone;
    terminateSessions = true;
  }

  if (parsed.data.email !== undefined) {
    if (!parsed.data.email || parsed.data.email.trim() === "") {
      data.email = null;
      data.emailVerifiedAt = null;
    } else {
      const email = normalizeEmail(parsed.data.email);
      if (!email) return { ok: false as const, error: "email_invalid" };
      data.email = email;
      data.emailVerifiedAt = new Date();
    }
    terminateSessions = true;
  }

  if (parsed.data.telegramId !== undefined) {
    const tid = parsed.data.telegramId?.trim() || null;
    if (tid && !/^\d{1,20}$/.test(tid)) return { ok: false as const, error: "telegram_invalid" };
    data.telegramId = tid;
  }

  try {
    await db.user.update({ where: { id: userId }, data });
    if (terminateSessions) await db.session.deleteMany({ where: { userId } });
    await audit(me.id, "staff.login", "User", userId, { fields: Object.keys(data) });
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const field = String((e.meta as { target?: string[] })?.target?.[0] ?? "");
      if (field.includes("phone")) return { ok: false as const, error: "phone_taken" };
      if (field.includes("email")) return { ok: false as const, error: "email_taken" };
      if (field.includes("telegram")) return { ok: false as const, error: "telegram_taken" };
      return { ok: false as const, error: "taken" };
    }
    throw e;
  }
}
