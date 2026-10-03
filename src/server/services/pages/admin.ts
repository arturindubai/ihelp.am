import "server-only";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { BUSY_STATUSES } from "@/server/services/booking";
import { addDays, atYerevan, isoWeekday, toMin, ymd } from "@/lib/time";

export const ADMIN_CLIENTS_PER = 40;
export const ADMIN_ORDERS_PER = 30;

// ──────────────── ДАШБОРД ────────────────

/** Все данные для дашборда администратора */
export async function getDashboardData() {
  const today = ymd(new Date());
  const d0 = atYerevan(today, "00:00");
  const d1 = atYerevan(addDays(today, 1), "00:00");
  const d2 = atYerevan(addDays(today, 2), "00:00");
  const d7 = atYerevan(addDays(today, 7), "00:00");
  const ago7 = new Date(Date.now() - 7 * 86400_000);
  const ago30 = new Date(Date.now() - 30 * 86400_000);

  const [todayCnt, tomorrowCnt, newOrders, revenue, subs, unassigned, pendingReviews, visits30, first30, cashNotConfirmed, cashInHands, upcoming, recent, masters] = await Promise.all([
    db.visit.count({ where: { scheduledAt: { gte: d0, lt: d1 }, status: { in: [...BUSY_STATUSES, "DONE"] } } }),
    db.visit.count({ where: { scheduledAt: { gte: d1, lt: d2 }, status: { in: BUSY_STATUSES } } }),
    db.order.count({ where: { createdAt: { gte: ago7 } } }),
    db.visit.aggregate({ where: { status: "DONE", finishedAt: { gte: ago30 } }, _sum: { price: true } }),
    db.order.count({ where: { kind: "SUBSCRIPTION", status: "ACTIVE" } }),
    db.visit.count({ where: { masterId: null, scheduledAt: { gte: new Date() }, status: { in: BUSY_STATUSES } } }),
    db.review.count({ where: { status: "PENDING" } }),
    db.visit.count({ where: { scheduledAt: { gte: ago30, lt: d1 }, status: { in: [...BUSY_STATUSES, "DONE"] } } }),
    db.visit.count({ where: { index: 1, scheduledAt: { gte: ago30, lt: d1 }, status: { in: [...BUSY_STATUSES, "DONE"] }, order: { config: { path: ["firstOrder"], equals: true } } } }),
    // cashNotConfirmed: визит выполнен, мастер не нажал «Получил наличные» — статус приёма неизвестен
    db.visit.aggregate({ where: { status: "DONE", cashCollected: false, order: { paymentMethod: "CASH" } }, _sum: { price: true }, _count: true }),
    // cashInHands: мастер отметил получение, деньги у него на руках, ещё не сданы
    db.visit.aggregate({ where: { status: "DONE", cashCollected: true, order: { paymentMethod: "CASH" } }, _sum: { price: true }, _count: true }),
    db.visit.findMany({ where: { scheduledAt: { gte: new Date() }, status: { in: BUSY_STATUSES } }, orderBy: { scheduledAt: "asc" }, take: 8, include: { master: true, order: { include: { user: true, service: true } } } }),
    db.order.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: true, service: true, plan: true } }),
    db.master.findMany({ where: { active: true }, include: { visits: { where: { scheduledAt: { gte: d0, lt: d7 }, status: { in: [...BUSY_STATUSES, "DONE"] } }, select: { durationMin: true } } } }),
  ]);

  let workMin = 0, busyMin = 0;
  for (const m of masters) {
    const wh = (m.workingHours || {}) as Record<string, [string, string][]>;
    for (let i = 0; i < 7; i++) for (const [f, e] of wh[String(isoWeekday(addDays(today, i)))] || []) workMin += toMin(e) - toMin(f);
    busyMin += m.visits.reduce((s, v) => s + v.durationMin, 0);
  }

  return { todayCnt, tomorrowCnt, newOrders, revenue, subs, unassigned, pendingReviews, visits30, first30, cashNotConfirmed, cashInHands, upcoming, recent, workMin, busyMin };
}

// ──────────────── КЛИЕНТЫ ────────────────

/** Список клиентов с пагинацией и поиском */
export async function getAdminClients(q: string | undefined, page: number) {
  const where = q
    ? { OR: [
        { phone: { contains: q.replace(/[^\d+]/g, "") || q } },
        { name: { contains: q, mode: "insensitive" as const } },
      ] }
    : {};
  const [users, count] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ADMIN_CLIENTS_PER,
      take: ADMIN_CLIENTS_PER,
      include: { _count: { select: { orders: true } }, orders: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
    }),
    db.user.count({ where }),
  ]);
  const spent = await db.visit.groupBy({
    by: ["orderId"],
    where: { cashCollected: true, order: { userId: { in: users.map((u) => u.id) } } },
    _sum: { price: true },
  });
  const orderUser = await db.order.findMany({
    where: { id: { in: spent.map((s) => s.orderId) } },
    select: { id: true, userId: true },
  });
  const byUser = new Map<string, number>();
  for (const s of spent) {
    const uid = orderUser.find((o) => o.id === s.orderId)!.userId;
    byUser.set(uid, (byUser.get(uid) || 0) + (s._sum.price || 0));
  }
  return { users, count, byUser };
}

/** Карточка клиента со всеми заказами, адресами и отзывами */
export async function getAdminClient(id: string) {
  return db.user.findUnique({
    where: { id },
    include: {
      addresses: true,
      orders: { orderBy: { createdAt: "desc" }, include: { service: true, plan: true } },
      reviews: { orderBy: { createdAt: "desc" } },
    },
  });
}

// ──────────────── ЗАКАЗЫ ────────────────

/** Список заказов с пагинацией и фильтрами */
export async function getAdminOrders(filters: { q?: string; status?: string; kind?: string }, page: number) {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.kind) where.kind = filters.kind;
  if (filters.q) {
    const q = filters.q.trim();
    const num = Number(q.replace(/\D/g, ""));
    where.OR = [
      ...(num && q.replace(/\D/g, "").length < 7 ? [{ number: num }] : []),
      { user: { phone: { contains: q.replace(/[^\d+]/g, "") || q } } },
      { user: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  const [orders, count] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ADMIN_ORDERS_PER,
      take: ADMIN_ORDERS_PER,
      include: {
        user: true,
        service: true,
        plan: true,
        visits: {
          where: { scheduledAt: { gte: new Date() }, status: { in: ["SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS"] } },
          orderBy: { scheduledAt: "asc" },
          take: 1,
          include: { master: true },
        },
      },
    }),
    db.order.count({ where }),
  ]);
  return { orders, count };
}

/** Детали заказа с визитами и списком подходящих мастеров */
export async function getAdminOrderDetail(id: string) {
  const o = await db.order.findUnique({
    where: { id },
    include: { user: true, service: true, plan: true, promoCode: true, visits: { orderBy: [{ index: "asc" }], include: { master: true } } },
  });
  if (!o) return null;
  const masters = await db.master.findMany({ where: { skills: { some: { id: o.serviceId } } }, orderBy: { sort: "asc" } });
  return { order: o, masters };
}

// ──────────────── МАСТЕРА ────────────────

/** Список всех мастеров с навыками */
export async function getAdminMasters() {
  return db.master.findMany({ orderBy: [{ active: "desc" }, { sort: "asc" }], include: { skills: true } });
}

/** Данные мастера для редактирования (id === "new" → null) */
export async function getAdminMasterEdit(id: string) {
  if (id === "new") {
    const services = await db.service.findMany({ orderBy: { sort: "asc" } });
    return { master: null, services };
  }
  const [master, services] = await Promise.all([
    db.master.findUnique({ where: { id }, include: { skills: { select: { id: true } }, timeOff: { orderBy: { from: "asc" } } } }),
    db.service.findMany({ orderBy: { sort: "asc" } }),
  ]);
  return { master, services };
}

// ──────────────── УСЛУГИ ────────────────

/** Список категорий с услугами для страницы каталога в админке */
export async function getAdminServices() {
  return db.category.findMany({
    orderBy: { sort: "asc" },
    include: { services: { orderBy: { sort: "asc" }, include: { _count: { select: { orders: true } } } } },
  });
}

/** Данные услуги для редактирования вместе со справочниками */
export async function getAdminServiceEdit(id: string) {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 86400_000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);
  const [service, cats, masters, visitCounts, orders30d] = await Promise.all([
    db.service.findUnique({
      where: { id },
      include: {
        groups: { orderBy: { sort: "asc" }, include: { options: { orderBy: { sort: "asc" } } } },
        plans: { orderBy: { sort: "asc" } },
        masters: { select: { id: true } },
      },
    }),
    db.category.findMany({ orderBy: { sort: "asc" } }),
    db.master.findMany({ orderBy: { sort: "asc" }, select: { id: true, name: true, photo: true, active: true } }),
    db.visit.groupBy({
      by: ["masterId"],
      where: {
        masterId: { not: null },
        scheduledAt: { gte: now, lte: weekEnd },
        status: { notIn: ["CANCELLED", "SKIPPED", "NO_SHOW"] },
      },
      _count: { id: true },
    }),
    db.order.count({ where: { serviceId: id, createdAt: { gte: thirtyDaysAgo } } }),
  ]);
  const visitMap = new Map(visitCounts.map((v) => [v.masterId, v._count.id]));
  return { service, cats, masters, visitMap, orders30d };
}

// ──────────────── РАСПИСАНИЕ ────────────────

/** Мастера и визиты на день для расписания */
export async function getAdminSchedule(from: Date, to: Date) {
  return Promise.all([
    db.master.findMany({ where: { active: true }, orderBy: { sort: "asc" }, include: { timeOff: { where: { from: { lt: to }, to: { gt: from } } } } }),
    db.visit.findMany({ where: { scheduledAt: { gte: from, lt: to }, status: { notIn: ["CANCELLED", "SKIPPED"] } }, orderBy: { scheduledAt: "asc" }, include: { order: { include: { user: true, service: true } } } }),
  ]);
}

// ──────────────── ОТЗЫВЫ ────────────────

/** Отзывы по статусу с количеством по каждому */
export async function getAdminReviews(status: "PENDING" | "APPROVED" | "REJECTED") {
  const [reviews, counts, masters, services] = await Promise.all([
    db.review.findMany({ where: { status }, orderBy: { createdAt: "desc" }, take: 100, include: { master: true, service: true, visit: { include: { order: true } } } }),
    db.review.groupBy({ by: ["status"], _count: true }),
    db.master.findMany({ orderBy: { sort: "asc" } }),
    db.service.findMany({ orderBy: { sort: "asc" } }),
  ]);
  return { reviews, counts, masters, services };
}

// ──────────────── ПРОЧИЕ СТРАНИЦЫ ────────────────

/** Сотрудники (роли OPERATOR, ADMIN, OWNER, MASTER) */
export async function getAdminStaff() {
  return db.user.findMany({ where: { role: { in: ["OPERATOR", "ADMIN", "OWNER", "MASTER"] } }, orderBy: [{ role: "desc" }, { createdAt: "asc" }] });
}

/** Баннеры для управления */
export async function getAdminBanners() {
  return db.banner.findMany({ orderBy: { sort: "asc" } });
}

/** Статус ИИ-помощника для панели баннеров */
export async function getAdminAiStatus() {
  const d = new Date();
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const [settings, usageRow] = await Promise.all([
    getSettings(),
    db.setting.findUnique({ where: { key: "_aiUsage" } }),
  ]);
  const usageData = (usageRow?.value as Record<string, { text: number; image: number }>) ?? {};
  const usageMonth = usageData[month] ?? { text: 0, image: 0 };
  return {
    hasAnthropicKey: !!settings.ai?.anthropicKey,
    hasHiggsfieldKey: !!settings.ai?.higgsfieldKey,
    usageCount: usageMonth.text + usageMonth.image,
  };
}

/** Промокоды и список услуг */
export async function getAdminPromos() {
  return Promise.all([
    db.promoCode.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] }),
    db.service.findMany({ orderBy: { sort: "asc" } }),
  ]);
}

/** Виджеты и FAQ сайта */
export async function getAdminContent() {
  return Promise.all([
    db.siteFeature.findMany({ orderBy: { sort: "asc" } }),
    db.siteFaq.findMany({ orderBy: { sort: "asc" } }),
  ]);
}

/** Переопределения строк интерфейса */
export async function getAdminTranslationOverrides() {
  return db.uiString.findMany();
}

/** Лог аудита */
export async function getAdminAuditLog() {
  return db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { user: true } });
}

/** Статические страницы сайта */
export async function getAdminPages() {
  return db.page.findMany({ orderBy: { slug: "asc" } });
}
