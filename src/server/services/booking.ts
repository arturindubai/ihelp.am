import "server-only";
import { Prisma, type PaymentMethod, type User, type VisitStatus } from "@prisma/client";
import { db } from "../db";
import { getSettings } from "../settings";
import { html, notifyTeam } from "../notify";
import { calculatePrice } from "@/lib/pricing";
import { computeSlots, isMasterFree, type MasterAvailability } from "@/lib/slots";
import { recurrenceDates, type Recurrence } from "@/lib/recurrence";
import { addDays, atYerevan, hm, isoWeekday, ymd } from "@/lib/time";
import { amd } from "@/lib/format";
import { tr } from "@/i18n/locales";
import { loadServiceRaw, localizeService, resolveSelection } from "./catalog";
import { checkPromo } from "./promo";

export const BUSY_STATUSES: VisitStatus[] = ["SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS"];

type Tx = Prisma.TransactionClient | typeof db;

export async function isFirstOrder(userId?: string | null) {
  if (!userId) return true;
  return (await db.order.count({ where: { userId, status: { not: "CANCELLED" } } })) === 0;
}

export async function loadAvailability(opts: { serviceId: string; from: Date; to: Date; masterIds?: string[]; excludeVisitId?: string; tx?: Tx }): Promise<MasterAvailability[]> {
  const c = opts.tx || db;
  const masters = await c.master.findMany({
    where: { active: true, skills: { some: { id: opts.serviceId } }, ...(opts.masterIds ? { id: { in: opts.masterIds } } : {}) },
    orderBy: { sort: "asc" },
    include: {
      timeOff: { where: { to: { gt: opts.from }, from: { lt: opts.to } } },
      visits: { where: { status: { in: BUSY_STATUSES }, scheduledAt: { gte: new Date(opts.from.getTime() - 12 * 3600_000), lt: opts.to }, ...(opts.excludeVisitId ? { id: { not: opts.excludeVisitId } } : {}) }, select: { scheduledAt: true, durationMin: true } },
    },
  });
  return masters.map((m) => ({
    id: m.id,
    workingHours: (m.workingHours || {}) as MasterAvailability["workingHours"],
    timeOff: m.timeOff.map((t) => ({ from: t.from, to: t.to })),
    busy: m.visits.map((v) => ({ start: v.scheduledAt!, end: new Date(v.scheduledAt!.getTime() + v.durationMin * 60_000) })),
  }));
}

export async function getSlots(serviceId: string, date: string, durationMin: number, masterId?: string | null) {
  const s = await getSettings();
  const from = atYerevan(date, "00:00");
  const to = atYerevan(addDays(date, 1), "12:00");
  const masters = await loadAvailability({ serviceId, from, to, masterIds: masterId ? [masterId] : undefined });
  return computeSlots({
    date,
    durationMin,
    bufferMin: s.booking.bufferMin,
    stepMin: s.booking.slotStepMin,
    notBefore: new Date(Date.now() + s.booking.leadHours * 3600_000),
    masters,
  }).map((x) => ({ time: x.time, masterIds: x.masterIds }));
}

/** Выбор мастера: предпочтительный, если свободен; иначе наименее загруженный на этой неделе */
async function pickMaster(tx: Tx, serviceId: string, start: Date, durationMin: number, preferredId: string | null, strict: boolean, bufferMin: number, excludeVisitId?: string) {
  const from = new Date(start.getTime() - 24 * 3600_000);
  const to = new Date(start.getTime() + 24 * 3600_000);
  const av = await loadAvailability({ serviceId, from, to, tx, excludeVisitId });
  const free = av.filter((m) => isMasterFree(m, start, durationMin, bufferMin));
  if (preferredId) {
    if (free.some((m) => m.id === preferredId)) return preferredId;
    if (strict) return null;
  }
  if (!free.length) return null;
  const weekStart = new Date(start.getTime() - 3.5 * 86400_000);
  const weekEnd = new Date(start.getTime() + 3.5 * 86400_000);
  const loads = await tx.visit.groupBy({ by: ["masterId"], where: { masterId: { in: free.map((f) => f.id) }, status: { in: BUSY_STATUSES }, scheduledAt: { gte: weekStart, lt: weekEnd } }, _count: true });
  const load = new Map(loads.map((l) => [l.masterId, l._count]));
  return [...free].sort((a, b) => (load.get(a.id) || 0) - (load.get(b.id) || 0))[0].id;
}

export interface CreateOrderInput {
  slug: string;
  optionIds: string[];
  planId: string | null;
  addressId: string;
  date: string;
  time: string;
  weekdays: number[];
  masterId: string | null;
  promoCode: string | null;
  comment: string | null;
  paymentMethod: PaymentMethod;
  locale: string;
  source?: string;
}

export class BookingError extends Error {}

export async function createOrder(user: User, input: CreateOrderInput) {
  const settings = await getSettings();
  const raw = await loadServiceRaw(input.slug);
  if (!raw) throw new BookingError("invalid");
  const view = localizeService(raw, "ru");
  const sel = resolveSelection(view, input.optionIds, input.planId);
  if (!sel.ok) throw new BookingError("invalid");
  if (input.paymentMethod === "CASH" && !settings.payments.cashEnabled) throw new BookingError("invalid");
  if (input.paymentMethod === "CARD" && !settings.payments.cardEnabled) throw new BookingError("invalid");

  const address = await db.address.findFirst({ where: { id: input.addressId, userId: user.id } });
  if (!address) throw new BookingError("no_address");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) throw new BookingError("no_slot");

  const plan = sel.plan;
  const kind = plan?.kind || "ONE_TIME";
  const weekdays = kind === "SUBSCRIPTION" ? (plan?.visitsPerWeek && plan.visitsPerWeek > 1 ? [...new Set(input.weekdays)].filter((d) => d >= 1 && d <= 7).sort() : [isoWeekday(input.date)]) : [];
  if (kind === "SUBSCRIPTION" && plan?.visitsPerWeek && plan.visitsPerWeek > 1) {
    if (weekdays.length < plan.visitsPerWeek) throw new BookingError("days");
    if (!weekdays.includes(isoWeekday(input.date))) weekdays.push(isoWeekday(input.date));
    weekdays.sort();
  }

  const first = await isFirstOrder(user.id);
  const base = calculatePrice({ lines: sel.lines, plan: sel.pricePlan, isFirstOrder: first, rules: settings.pricing });
  let promoId: string | null = null;
  let promo = null;
  if (input.promoCode) {
    const pc = await checkPromo({ code: input.promoCode, userId: user.id, phone: user.phone, serviceId: raw.id, planKind: kind, amount: base.first.base, isFirstOrder: first });
    if (pc.ok) {
      promo = pc.promo;
    }
  }
  const price = calculatePrice({ lines: sel.lines, plan: sel.pricePlan, isFirstOrder: first, promo, rules: settings.pricing });
  if (promo && price.promoApplied) promoId = promo.id;

  const start = atYerevan(input.date, input.time);
  if (start.getTime() < Date.now() + settings.booking.leadHours * 3600_000 - 5 * 60_000) throw new BookingError("slot_taken");
  const durationMin = sel.durationMin;
  const buffer = settings.booking.bufferMin;

  const order = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(424242)`;
      const masterId = await pickMaster(tx, raw.id, start, durationMin, input.masterId, !!input.masterId, buffer);
      if (!masterId) throw new BookingError("slot_taken");

      const recurrence: Recurrence | null = kind === "SUBSCRIPTION" ? { start: input.date, time: input.time, weekdays, intervalDays: plan?.intervalDays || 7 } : null;
      const addressSnapshot = { district: address.district, street: address.street, building: address.building, entrance: address.entrance, floor: address.floor, apartment: address.apartment, intercom: address.intercom, comment: address.comment, label: address.label };
      const config = {
        service: { slug: raw.slug, title: raw.title },
        plan: plan ? { id: plan.id, kind: plan.kind, title: raw.plans.find((p) => p.id === plan.id)?.title, discountPercent: plan.discountPercent, packageVisits: plan.packageVisits, intervalDays: plan.intervalDays, visitsPerWeek: plan.visitsPerWeek } : null,
        options: sel.lines.map((l) => {
          const g = raw.groups.find((x) => x.id === l.groupId)!;
          const o = g.options.find((x) => x.id === l.optionId)!;
          return { groupId: g.id, optionId: o.id, group: g.title, option: o.title, price: o.price, durationMin: o.durationMin, discountable: o.discountable };
        }),
        promoCode: promoId ? promo?.code : null,
        firstOrder: first,
      };

      const created = await tx.order.create({
        data: {
          userId: user.id,
          serviceId: raw.id,
          planId: plan?.id,
          kind,
          addressId: address.id,
          addressSnapshot,
          config: config as Prisma.InputJsonValue,
          pricing: price as unknown as Prisma.InputJsonValue,
          pricePerVisit: price.regular.price,
          firstVisitPrice: price.first.price,
          total: price.payNow,
          durationMin,
          recurrence: (recurrence as unknown as Prisma.InputJsonValue) ?? undefined,
          preferredMasterId: masterId,
          paymentMethod: input.paymentMethod,
          promoCodeId: promoId,
          comment: input.comment?.slice(0, 1000) || null,
          locale: input.locale,
          source: input.source || "web",
          expiresAt: kind === "PACKAGE" && plan?.validityDays ? new Date(Date.now() + plan.validityDays * 86400_000) : null,
        },
      });

      await tx.visit.create({ data: { orderId: created.id, index: 1, scheduledAt: start, durationMin, masterId, price: price.first.price } });
      if (kind === "PACKAGE") {
        const n = price.visits || 1;
        for (let i = 2; i <= n; i++) {
          await tx.visit.create({ data: { orderId: created.id, index: i, scheduledAt: null, status: "UNSCHEDULED", durationMin, price: price.regular.price } });
        }
      }
      if (kind === "SUBSCRIPTION") {
        await generateSubscriptionVisits(tx, created.id, settings.booking.subscriptionHorizonDays, buffer);
      }
      if (promoId) {
        await tx.promoRedemption.create({ data: { promoId, userId: user.id, orderId: created.id, phone: user.phone } });
        await tx.promoCode.update({ where: { id: promoId }, data: { usedCount: { increment: 1 } } });
      }
      await tx.service.update({ where: { id: raw.id }, data: { bookingsCount: { increment: 1 } } });
      return created;
    },
    { timeout: 20_000 },
  );

  const m = order.preferredMasterId ? await db.master.findUnique({ where: { id: order.preferredMasterId } }) : null;
  // Имя, адрес и названия подставляются через html`` — спецсимволы не ломают сообщение в Telegram
  await notifyTeam(
    html`🆕 <b>Заказ №${order.number}</b>\n${tr(raw.title, "ru")} · ${tr(raw.plans.find((p) => p.id === plan?.id)?.title, "ru") || ""}\n` +
      html`📅 ${input.date} ${input.time} · ${Math.round(durationMin / 30) / 2} ч\n👤 ${user.name || ""} ${user.phone}\n📍 ${address.street} ${address.building}${address.apartment ? ", кв. " + address.apartment : ""}\n` +
      html`🧹 ${m ? tr(m.name, "ru") : "—"}\n💰 ${amd(price.payNow)} · ${input.paymentMethod === "CASH" ? "наличные" : "карта"}`,
  );
  return order;
}

/** Досоздаёт визиты подписки до горизонта. Вызывается при создании заказа и по крону. */
export async function generateSubscriptionVisits(tx: Tx, orderId: string, horizonDays: number, bufferMin: number) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { visits: { select: { scheduledAt: true, index: true } } } });
  if (!order || order.kind !== "SUBSCRIPTION" || order.status !== "ACTIVE" || !order.recurrence) return 0;
  const r = order.recurrence as unknown as Recurrence;
  const today = ymd(new Date());
  const until = addDays(today, horizonDays);
  const existing = new Set(order.visits.filter((v) => v.scheduledAt).map((v) => ymd(v.scheduledAt!)));
  const fromDate = order.pausedUntil && ymd(order.pausedUntil) > today ? ymd(order.pausedUntil) : today;
  let idx = Math.max(0, ...order.visits.map((v) => v.index));
  let created = 0;
  for (const d of recurrenceDates(r, fromDate > r.start ? fromDate : r.start, until)) {
    if (existing.has(d)) continue;
    const start = atYerevan(d, r.time);
    if (start < new Date()) continue;
    const masterId = await pickMaster(tx, order.serviceId, start, order.durationMin, order.preferredMasterId, false, bufferMin);
    idx += 1;
    await tx.visit.create({ data: { orderId: order.id, index: idx, scheduledAt: start, durationMin: order.durationMin, masterId, price: order.pricePerVisit } });
    created++;
  }
  await tx.order.update({ where: { id: order.id }, data: { generatedUntil: atYerevan(until, "23:59") } });
  return created;
}

/** Перенос / планирование визита (клиент, админ) */
export async function scheduleVisit(visitId: string, date: string, time: string, masterId: string | null, opts: { strictMaster?: boolean } = {}) {
  const settings = await getSettings();
  const start = atYerevan(date, time);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(424242)`;
    const v = await tx.visit.findUniqueOrThrow({ where: { id: visitId }, include: { order: true } });
    const chosen = await pickMaster(tx, v.order.serviceId, start, v.durationMin, masterId || v.masterId || v.order.preferredMasterId, !!opts.strictMaster, settings.booking.bufferMin, v.id);
    if (!chosen) throw new BookingError("slot_taken");
    return tx.visit.update({ where: { id: v.id }, data: { scheduledAt: start, masterId: chosen, status: "SCHEDULED" } });
  });
}

export function visitWindow(v: { scheduledAt: Date | null; durationMin: number }) {
  if (!v.scheduledAt) return null;
  return `${hm(v.scheduledAt)}–${hm(new Date(v.scheduledAt.getTime() + v.durationMin * 60_000))}`;
}
