import "server-only";
import { db } from "../db";
import { escapeHtml } from "@/lib/html";
import { enqueueAndSend } from "./notifyQueue";
import { getSettings } from "../settings";
import { tr } from "@/i18n/locales";
import { hm, ymd } from "@/lib/time";
import { amd } from "@/lib/format";
import { sendMail, mailTemplate } from "./mail";
import { notifyTech, html } from "../notify";
import ru from "../../../messages/ru.json";

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

function fill(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), escapeHtml(v)), template);
}

/** Отправить клиентское уведомление по наиболее доступному каналу:
 *  Telegram (@ihelp_am_bot) → email → алерт оператору. */
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
        await enqueueAndSend(user.telegramId, text, tag, token, "notify.telegramBotToken");
        return "telegram";
      }
    } catch (e) {
      console.error(`[bookingNotify:${tag}] telegram failed`, e);
    }
  }

  if (user?.email) {
    try {
      const s = await getSettings();
      const brand = s.brand.name || "iHelp";
      const lines = text
        .replace(/<[^>]+>/g, "")
        .split("\n")
        .filter(Boolean);
      const htmlBody = mailTemplate({ title: mailSubject, lines, brand });
      const r = await sendMail({ to: user.email, subject: mailSubject, html: htmlBody, text });
      if (r.ok) return "email";
    } catch (e) {
      console.error(`[bookingNotify:${tag}] email failed`, e);
    }
  }

  // Нет ни Telegram, ни email — алерт оператору
  try {
    const userName = user?.name || userId;
    await notifyTech(html`⚠️ Нет канала доставки для клиента ${userName}: ${mailSubject}`);
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

const tmpl = ru.notify.order;

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

/** 2. Мастер назначен на визит (явно через админ/оператора) */
export async function notifyClientMasterAssigned(visitId: string): Promise<void> {
  const ok = await markVisitEvent(visitId, "masterAssigned");
  if (!ok) return;

  try {
    const visit = await db.visit.findUnique({
      where: { id: visitId },
      select: {
        scheduledAt: true,
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
    if (!visit?.scheduledAt || !visit.master) return;

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

/** 4. Визит или заказ отменён — уведомление по orderId. */
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

    const text = fill(tmpl.cancelled, {
      serviceName: serviceTitle(order.config),
      date: dateStr,
    });

    await sendToClient(order.userId, text, `Заказ №${order.number} отменён`, "client:cancelled");
  } catch (e) {
    console.error("[bookingNotify:cancelled] ошибка", e);
  }
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
            number: true,
            userId: true,
          },
        },
      },
    });
    if (!visit) return;

    const masterName = visit.master ? tr(visit.master.name, "ru") : "Мастер";
    const appUrl = process.env.APP_URL || "";
    const reviewLink = `${appUrl}/ru/account/orders/${visit.order.number}`;

    const text = fill(tmpl.completed, {
      masterName,
      reviewLink,
    });

    await sendToClient(visit.order.userId, text, `Как прошёл визит? — заказ №${visit.order.number}`, "client:completed");
  } catch (e) {
    console.error("[bookingNotify:completed] ошибка", e);
  }
}
