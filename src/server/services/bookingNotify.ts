import "server-only";
import { db } from "../db";
import { escapeHtml } from "@/lib/html";
import { sendTelegramDirect } from "./notifyQueue";
import { getSettings, getUiOverrides } from "../settings";
import { tr } from "@/i18n/locales";
import { hm, ymd } from "@/lib/time";
import { amd } from "@/lib/format";
import { sendMail, mailTemplate } from "./mail";
import { notifyTech, html } from "../notify";
import defaultTemplates from "../../../messages/ru.json";

type AddressSnapshot = { street?: string; building?: string; apartment?: string };
type Config = { service?: { title?: unknown }; plan?: { title?: unknown } | null };

function addrLine(snapshot: unknown): string {
  const a = snapshot as AddressSnapshot | null;
  if (!a?.street) return "—";
  return `${a.street} ${a.building ?? ""}${a.apartment ? ", кв. " + a.apartment : ""}`.trim();
}

function serviceTitle(config: unknown): string {
  const c = config as Config | null;
  const svc = tr(c?.service?.title, "ru");
  const plan = tr(c?.plan?.title ?? null, "ru");
  return [svc, plan].filter(Boolean).join(" · ");
}

/** Подставить параметры в шаблон, значения экранированы для Telegram HTML */
function fill(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), escapeHtml(v)), template);
}

/** Шаблоны уведомлений с учётом правок из Админки → Переводы (правятся без пересборки) */
async function getOrderTemplates(): Promise<typeof defaultTemplates.notify.order> {
  const overrides = await getUiOverrides("ru");
  const tmpl = { ...defaultTemplates.notify.order };
  for (const o of overrides) {
    if (o.key.startsWith("notify.order.")) {
      const subKey = o.key.slice("notify.order.".length) as keyof typeof tmpl;
      if (subKey in tmpl) (tmpl as Record<string, string>)[subKey] = o.value;
    }
  }
  return tmpl;
}

/** Отправить клиентское уведомление по наиболее доступному каналу:
 *  Telegram (прямая отправка, при сбое — fallback) → email → алерт оператору. */
async function sendToClient(
  userId: string,
  text: string,
  mailSubject: string,
  tag: string,
): Promise<"telegram" | "email" | "alert" | "none"> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { telegramId: true, email: true, name: true },
  });

  if (user?.telegramId) {
    try {
      const s = await getSettings();
      const token = s.notify.telegramBotToken;
      if (token) {
        await sendTelegramDirect(token, user.telegramId, text);
        return "telegram";
      }
    } catch (e) {
      console.error(`[bookingNotify:${tag}] telegram failed, trying email`, e);
    }
  }

  if (user?.email) {
    try {
      const s = await getSettings();
      if (s.mail.enabled) {
        const brand = s.brand.name || "iHelp";
        // Убрать HTML-теги и снять HTML-экранирование для plain text email
        const plainText = text
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");
        const lines = plainText.split("\n").filter(Boolean);
        const htmlBody = mailTemplate({ title: mailSubject, lines, brand });
        const r = await sendMail({ to: user.email, subject: mailSubject, html: htmlBody, text: plainText });
        if (r.ok) return "email";
      }
    } catch (e) {
      console.error(`[bookingNotify:${tag}] email failed`, e);
    }
  }

  // Нет канала — алерт оператору (без персональных данных клиента)
  try {
    await notifyTech(html`⚠️ Нет канала доставки для уведомления: ${mailSubject}`);
  } catch (e) {
    console.error(`[bookingNotify:${tag}] alert failed`, e);
  }
  return "alert";
}

/** Проверить, что событие ещё не было отправлено для заказа, и добавить его в список. */
async function markOrderEvent(orderId: string, eventKey: string): Promise<boolean> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { clientNotifiedEvents: true } });
  if (!order) return false;
  if (order.clientNotifiedEvents.includes(eventKey)) return false;
  await db.order.update({
    where: { id: orderId },
    data: { clientNotifiedEvents: { push: eventKey } },
  });
  return true;
}

/** Проверить, что событие ещё не было отправлено для визита, и добавить его в список. */
async function markVisitEvent(visitId: string, eventKey: string): Promise<boolean> {
  const visit = await db.visit.findUnique({ where: { id: visitId }, select: { clientNotifiedEvents: true } });
  if (!visit) return false;
  if (visit.clientNotifiedEvents.includes(eventKey)) return false;
  await db.visit.update({
    where: { id: visitId },
    data: { clientNotifiedEvents: { push: eventKey } },
  });
  return true;
}

/** 1. Клиент создал заказ — отправить подтверждение */
export async function notifyClientOrderCreated(orderId: string): Promise<void> {
  const ok = await markOrderEvent(orderId, "created");
  if (!ok) return;

  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        number: true,
        userId: true,
        firstVisitPrice: true,
        config: true,
        addressSnapshot: true,
        visits: { where: { index: 1 }, select: { scheduledAt: true }, take: 1 },
      },
    });
    if (!order) return;

    const visit = order.visits[0];
    if (!visit?.scheduledAt) return;

    const tmpl = await getOrderTemplates();
    const text = fill(tmpl.created, {
      serviceName: serviceTitle(order.config),
      date: ymd(visit.scheduledAt),
      time: hm(visit.scheduledAt),
      address: addrLine(order.addressSnapshot),
      price: amd(order.firstVisitPrice),
    });

    await sendToClient(order.userId, text, `Заказ №${order.number} принят`, "client:created");
  } catch (e) {
    console.error("[bookingNotify:created] ошибка", e);
  }
}

/** 2. Мастер назначен или сменён на визите (явно через админ/оператора).
 *  Ключ включает masterId: повторный вызов с тем же мастером не даёт второго сообщения,
 *  но смена мастера на другого — даёт новое уведомление. */
export async function notifyClientMasterAssigned(visitId: string): Promise<void> {
  try {
    const visit = await db.visit.findUnique({
      where: { id: visitId },
      select: {
        scheduledAt: true,
        masterId: true,
        master: { select: { name: true } },
        order: {
          select: {
            number: true,
            userId: true,
            config: true,
          },
        },
      },
    });
    if (!visit?.scheduledAt || !visit.master || !visit.masterId) return;

    const eventKey = `masterAssigned:${visit.masterId}`;
    const ok = await markVisitEvent(visitId, eventKey);
    if (!ok) return;

    const tmpl = await getOrderTemplates();
    const masterName = tr(visit.master.name, "ru");
    const text = fill(tmpl.masterAssigned, {
      serviceName: serviceTitle(visit.order.config),
      date: ymd(visit.scheduledAt),
      time: hm(visit.scheduledAt),
      masterName,
    });

    await sendToClient(visit.order.userId, text, `Мастер назначен — заказ №${visit.order.number}`, "client:masterAssigned");
  } catch (e) {
    console.error("[bookingNotify:masterAssigned] ошибка", e);
  }
}

/** 3. Визит перенесён (клиентом или оператором) */
export async function notifyClientRescheduled(visitId: string): Promise<void> {
  try {
    const visit = await db.visit.findUnique({
      where: { id: visitId },
      select: {
        scheduledAt: true,
        order: {
          select: {
            number: true,
            userId: true,
            config: true,
            addressSnapshot: true,
          },
        },
      },
    });
    if (!visit?.scheduledAt) return;

    // Ключ включает дату назначения: повторный перенос на другую дату даёт новое уведомление
    const eventKey = `rescheduled:${visit.scheduledAt.toISOString()}`;
    const ok = await markVisitEvent(visitId, eventKey);
    if (!ok) return;

    const tmpl = await getOrderTemplates();
    const text = fill(tmpl.rescheduled, {
      serviceName: serviceTitle(visit.order.config),
      date: ymd(visit.scheduledAt),
      time: hm(visit.scheduledAt),
      address: addrLine(visit.order.addressSnapshot),
    });

    await sendToClient(visit.order.userId, text, `Визит перенесён — заказ №${visit.order.number}`, "client:rescheduled");
  } catch (e) {
    console.error("[bookingNotify:rescheduled] ошибка", e);
  }
}

/** 4. Заказ целиком отменён — уведомление по orderId. */
export async function notifyClientCancelled(orderId: string): Promise<void> {
  const ok = await markOrderEvent(orderId, "cancelled");
  if (!ok) return;

  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        number: true,
        userId: true,
        config: true,
        visits: {
          where: { status: "CANCELLED" },
          orderBy: { scheduledAt: "asc" },
          select: { scheduledAt: true },
          take: 1,
        },
      },
    });
    if (!order) return;

    const visit = order.visits[0];
    const dateStr = visit?.scheduledAt ? ymd(visit.scheduledAt) : "—";

    const tmpl = await getOrderTemplates();
    const text = fill(tmpl.cancelled, {
      serviceName: serviceTitle(order.config),
      date: dateStr,
    });

    await sendToClient(order.userId, text, `Заказ №${order.number} отменён`, "client:cancelled");
  } catch (e) {
    console.error("[bookingNotify:cancelled] ошибка", e);
  }
}

/** 4а. Один визит отменён администратором — уведомление по visitId. */
export async function notifyClientVisitCancelled(visitId: string): Promise<void> {
  const ok = await markVisitEvent(visitId, "cancelled");
  if (!ok) return;

  try {
    const visit = await db.visit.findUnique({
      where: { id: visitId },
      select: {
        scheduledAt: true,
        order: {
          select: {
            number: true,
            userId: true,
            config: true,
          },
        },
      },
    });
    if (!visit) return;

    const dateStr = visit.scheduledAt ? ymd(visit.scheduledAt) : "—";
    const tmpl = await getOrderTemplates();
    const text = fill(tmpl.cancelled, {
      serviceName: serviceTitle(visit.order.config),
      date: dateStr,
    });

    await sendToClient(visit.order.userId, text, `Визит ${dateStr} отменён — заказ №${visit.order.number}`, "client:visitCancelled");
  } catch (e) {
    console.error("[bookingNotify:visitCancelled] ошибка", e);
  }
}

const HOUR_MS = 3_600_000;

/**
 * 6. Напоминания клиентам: за 24 часа (окно 22–26 ч) и за 2 часа (окно 1.5–2.5 ч).
 * Дедупликация через clientNotifiedEvents: ключи "reminder24h" и "reminder2h".
 * Отменённые визиты исключены статусным фильтром (SCHEDULED/CONFIRMED).
 */
export async function sendVisitReminders(now: Date): Promise<{ sent: number }> {
  const windows = [
    { key: "reminder24h" as const, minMs: 22 * HOUR_MS, maxMs: 26 * HOUR_MS },
    { key: "reminder2h" as const, minMs: 90 * 60_000, maxMs: 150 * 60_000 },
  ];

  let sent = 0;

  for (const { key, minMs, maxMs } of windows) {
    const from = new Date(now.getTime() + minMs);
    const to = new Date(now.getTime() + maxMs);

    const visits = await db.visit.findMany({
      where: {
        status: { in: ["SCHEDULED", "CONFIRMED"] },
        scheduledAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        scheduledAt: true,
        clientNotifiedEvents: true,
        master: { select: { name: true } },
        order: {
          select: {
            number: true,
            userId: true,
            config: true,
            addressSnapshot: true,
          },
        },
      },
    });

    for (const visit of visits) {
      if (visit.clientNotifiedEvents.includes(key)) continue;
      if (!visit.scheduledAt) continue;

      const ok = await markVisitEvent(visit.id, key);
      if (!ok) continue;

      try {
        const tmpl = await getOrderTemplates();
        const text = fill(tmpl[key], {
          serviceName: serviceTitle(visit.order.config),
          date: ymd(visit.scheduledAt),
          time: hm(visit.scheduledAt),
          address: addrLine(visit.order.addressSnapshot),
          masterName: visit.master ? tr(visit.master.name, "ru") : "—",
        });
        await sendToClient(visit.order.userId, text, `Напоминание — заказ №${visit.order.number}`, `client:${key}`);
        sent++;
      } catch (e) {
        console.error(`[bookingNotify:${key}] ошибка для визита ${visit.id}`, e);
      }
    }
  }

  return { sent };
}

/** 5. Визит завершён (статус DONE) */
export async function notifyClientVisitCompleted(visitId: string): Promise<void> {
  const ok = await markVisitEvent(visitId, "completed");
  if (!ok) return;

  try {
    const visit = await db.visit.findUnique({
      where: { id: visitId },
      select: {
        master: { select: { name: true } },
        order: {
          select: {
            id: true,
            number: true,
            userId: true,
          },
        },
      },
    });
    if (!visit) return;

    const masterName = visit.master ? tr(visit.master.name, "ru") : "—";
    const appUrl = process.env.APP_URL || "";
    const reviewLink = `${appUrl}/ru/account/orders/${visit.order.id}`;

    const tmpl = await getOrderTemplates();
    const text = fill(tmpl.completed, {
      masterName,
      reviewLink,
    });

    await sendToClient(visit.order.userId, text, `Как прошёл визит? — заказ №${visit.order.number}`, "client:completed");
  } catch (e) {
    console.error("[bookingNotify:completed] ошибка", e);
  }
}
