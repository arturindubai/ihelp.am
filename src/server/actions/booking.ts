"use server";
import { z } from "zod";
import { db } from "../db";
import { getCurrentUser } from "../auth";
import { getSettings } from "../settings";
import { BookingError, createOrder, getSlots, isFirstOrder } from "../services/booking";
import { loadServiceRaw, localizeService, resolveSelection } from "../services/catalog";
import { checkPromo } from "../services/promo";
import { calculatePrice } from "@/lib/pricing";

export async function slotsAction(serviceId: string, date: string, durationMin: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const d = Math.min(Math.max(30, Math.round(durationMin)), 12 * 60);
  return getSlots(serviceId, date, d);
}

const addressSchema = z.object({
  id: z.string().optional(),
  label: z.string().max(40).optional().nullable(),
  district: z.string().max(60).optional().nullable(),
  street: z.string().trim().min(2).max(120),
  building: z.string().trim().min(1).max(20),
  entrance: z.string().max(10).optional().nullable(),
  floor: z.string().max(10).optional().nullable(),
  apartment: z.string().max(10).optional().nullable(),
  intercom: z.string().max(20).optional().nullable(),
  comment: z.string().max(300).optional().nullable(),
  isDefault: z.boolean().optional(),
});
export type AddressInput = z.infer<typeof addressSchema>;

export async function saveAddressAction(input: AddressInput) {
  const u = await getCurrentUser();
  if (!u) return { ok: false as const, error: "auth" };
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid", fields: parsed.error.flatten().fieldErrors };
  const { id, ...data } = parsed.data;
  const count = await db.address.count({ where: { userId: u.id } });
  const isDefault = data.isDefault || count === 0;
  if (isDefault) await db.address.updateMany({ where: { userId: u.id }, data: { isDefault: false } });
  const address = id
    ? await db.address.update({ where: { id, userId: u.id }, data: { ...data, isDefault } })
    : await db.address.create({ data: { ...data, isDefault, userId: u.id } });
  return { ok: true as const, address };
}

export async function deleteAddressAction(id: string) {
  const u = await getCurrentUser();
  if (!u) return { ok: false };
  await db.address.deleteMany({ where: { id, userId: u.id } });
  return { ok: true };
}

/** Проверка промокода: только для вошедшего клиента, иначе коды можно перебирать анонимно */
export async function promoAction(slug: string, optionIds: string[], planId: string | null, code: string) {
  const u = await getCurrentUser();
  if (!u) return { ok: false as const, error: "auth" };
  const raw = await loadServiceRaw(slug);
  if (!raw) return { ok: false as const, error: "not_found" };
  const settings = await getSettings();
  const sel = resolveSelection(localizeService(raw, "ru"), optionIds, planId);
  if (!sel.ok) return { ok: false as const, error: "not_found" };
  const first = await isFirstOrder(u?.id);
  const base = calculatePrice({ lines: sel.lines, plan: sel.pricePlan, isFirstOrder: first, rules: settings.pricing });
  const r = await checkPromo({ code, userId: u?.id, phone: u?.phone, serviceId: raw.id, planKind: sel.plan?.kind || "ONE_TIME", amount: base.first.base, isFirstOrder: first });
  if (!r.ok) return r;
  const { id: _id, ...promo } = r.promo;
  return { ok: true as const, promo };
}

const orderSchema = z.object({
  slug: z.string(),
  optionIds: z.array(z.string()).max(50),
  planId: z.string().nullable(),
  addressId: z.string(),
  date: z.string(),
  time: z.string(),
  weekdays: z.array(z.number().int()).max(7),
  masterId: z.string().nullable(),
  promoCode: z.string().max(40).nullable(),
  comment: z.string().max(1000).nullable(),
  paymentMethod: z.enum(["CASH", "CARD"]),
  locale: z.string().max(5),
});

export async function createOrderAction(input: z.infer<typeof orderSchema>) {
  const u = await getCurrentUser();
  if (!u) return { ok: false as const, error: "auth" };
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  try {
    const order = await createOrder(u, parsed.data);
    return { ok: true as const, orderId: order.id, number: order.number };
  } catch (e) {
    if (e instanceof BookingError) return { ok: false as const, error: e.message };
    console.error("[createOrder]", e);
    return { ok: false as const, error: "invalid" };
  }
}
