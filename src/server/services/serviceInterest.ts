import "server-only";
import { db } from "@/server/db";
import { html, notifyTeam } from "@/server/notify";
import { getSettings } from "@/server/settings";
import { ymd } from "@/lib/time";

export type InterestRow = {
  serviceSlug: string;
  kind: string;
  label: string;
  categoryLabel: string;
  total: number;
  last7: number;
  last30: number;
  lastAt: Date | null;
};

export type InterestContact = {
  id: string;
  contact: string;
  createdAt: Date;
};

/** Сводная таблица: slug → количество заявок всего, за 7 и 30 дней, дата последней */
export async function getInterestStats(): Promise<InterestRow[]> {
  const now = new Date();
  const ago7 = new Date(now.getTime() - 7 * 86400_000);
  const ago30 = new Date(now.getTime() - 30 * 86400_000);

  const rows = await db.serviceInterest.groupBy({
    by: ["serviceSlug", "kind"],
    _count: { id: true },
    _max: { createdAt: true },
    orderBy: { _count: { id: "desc" } },
  });

  const rows7 = await db.serviceInterest.groupBy({
    by: ["serviceSlug"],
    where: { createdAt: { gte: ago7 } },
    _count: { id: true },
  });

  const rows30 = await db.serviceInterest.groupBy({
    by: ["serviceSlug"],
    where: { createdAt: { gte: ago30 } },
    _count: { id: true },
  });

  const map7 = new Map(rows7.map((r) => [r.serviceSlug, r._count.id]));
  const map30 = new Map(rows30.map((r) => [r.serviceSlug, r._count.id]));

  const slugs = [...new Set(rows.map((r) => r.serviceSlug))];
  const [categories, services] = await Promise.all([
    db.category.findMany({ where: { slug: { in: slugs } }, select: { slug: true, title: true } }),
    db.service.findMany({
      where: { slug: { in: slugs } },
      select: { slug: true, title: true, category: { select: { slug: true, title: true } } },
    }),
  ]);

  const catMap = new Map(categories.map((c) => [c.slug, c.title as Record<string, string>]));
  const svcMap = new Map(services.map((s) => [s.slug, s]));

  const ru = (t: Record<string, string> | null | undefined) => (t?.ru ?? t?.en ?? Object.values(t ?? {})[0] ?? "");

  return rows.map((r) => {
    const svc = svcMap.get(r.serviceSlug);
    const catTitle = svc ? ru(svc.category.title as Record<string, string>) : ru(catMap.get(r.serviceSlug));
    const label = svc ? ru(svc.title as Record<string, string>) : ru(catMap.get(r.serviceSlug));
    return {
      serviceSlug: r.serviceSlug,
      kind: r.kind,
      label,
      categoryLabel: svc ? catTitle : "— категория",
      total: r._count.id,
      last7: map7.get(r.serviceSlug) ?? 0,
      last30: map30.get(r.serviceSlug) ?? 0,
      lastAt: r._max.createdAt,
    };
  });
}

/** Список контактов по slug — только для выгрузки администратором, не для логов */
export async function getInterestContacts(slug: string, limit = 200, offset = 0): Promise<InterestContact[]> {
  const rows = await db.serviceInterest.findMany({
    where: { serviceSlug: slug },
    select: { id: true, contact: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
  return rows;
}

/** CSV всех заявок: slug, kind, contact, date — без IP */
export async function interestContactsCsv(slug?: string): Promise<string> {
  const rows = await db.serviceInterest.findMany({
    where: slug ? { serviceSlug: slug } : undefined,
    select: { serviceSlug: true, kind: true, contact: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const header = "slug,kind,contact,date\n";
  const lines = rows.map((r) => `${r.serviceSlug},${r.kind},${JSON.stringify(r.contact)},${ymd(r.createdAt)}`);
  return header + lines.join("\n");
}

/** Уведомление команде о новой заявке (режим «сразу») */
export async function notifyNewInterest(serviceSlug: string, kind: string) {
  try {
    const s = await getSettings();
    if (s.notify.interestNotifyMode !== "immediate") return;
    const label = kind === "service" ? "услугу" : "категорию";
    await notifyTeam(html`🔔 <b>Новая заявка «Уведомить меня»</b>\n${label}: <b>${serviceSlug}</b>`);
  } catch (e) {
    console.error("[interest] уведомление не отправлено", e);
  }
}

/** Суточный дайджест: сколько заявок пришло вчера, по услугам */
export async function sendInterestDigest(now: Date) {
  const s = await getSettings();
  if (s.notify.interestNotifyMode !== "digest") return;

  const ago24 = new Date(now.getTime() - 24 * 3600_000);
  const rows = await db.serviceInterest.groupBy({
    by: ["serviceSlug", "kind"],
    where: { createdAt: { gte: ago24 } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });
  if (!rows.length) return;

  const total = rows.reduce((s, r) => s + r._count.id, 0);
  const lines = rows.map((r) => `• ${r.serviceSlug} (${r.kind}): ${r._count.id}`);
  await notifyTeam(html`📋 <b>Дайджест «Уведомить меня» за 24 ч</b>\nЗаявок: <b>${total}</b>\n${lines.join("\n")}`);
}
