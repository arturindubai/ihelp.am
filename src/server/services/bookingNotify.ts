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
import { createReviewToken } from "./reviews";
import { getEmailBannerHtml } from "./banners";
import { loadMessages } from "@/i18n/messages";
import defaultTemplates from "../../../messages/ru.json";

type AddressSnapshot = { street?: string; building?: string; apartment?: string };
type Config = { service?: { title?: unknown }; plan?: { title?: unknown } | null };

/** Тема письма по ключу из messages/notify.order с учётом локали клиента */
async function mailSubject(locale: string, key: string, params: Record<string, string | number>): Promise<string> {
  const msgs = await loadMessages(locale);
  const order = (msgs.notify as Record<string, unknown>)?.order as Record<string, string> | undefined;
  const tmpl = order?.[key];
  if (!tmpl) return "";
  return Object.entries(params).reduce((s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)), tmpl);
}

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
  subject: string,
  tag: string,
  log?: { orderId: string; visitId?: string; event: string },
  locale = "ru",
): Promise<"telegram" | "email" | "alert" | "none"> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { telegramId: true, email: true, name: true },
  });

  let channel: "telegram" | "email" | "alert" | "none" = "none";

  if (user?.telegramId) {
    try {
      const s = await getSettings();
      const token = s.notify.telegramBotToken;
      if (token) {
        await sendTelegramDirect(token, user.telegramId, text);
        channel = "telegram";
      }
    } catch (e) {
      console.error(`[bookingNotify:${tag}] telegram failed, trying email`, e);
    }
  }

  if (channel === "none" && user?.email) {
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
        const bannerHtml = await getEmailBannerHtml(locale).catch(() => null);
        const htmlBody = mailTemplate({ title: subject, lines, brand, ...(bannerHtml ? { bannerHtml } : {}) });
        const r = await sendMail({ to: user.email, subject, html: htmlBody, text: plainText });
        if (r.ok) channel = "email";
      }
    } catch (e) {
      console.error(`[bookingNotify:${tag}] email failed`, e);
    }
  }

  if (channel === "none") {
    // Нет канала — алерт оператору (без персональных данных клиента)
    try {
      await notifyTech(html`⚠️ Нет канала доставки для уведомления: ${mailSubject}`);
    } catch (e) {
      console.error(`[bookingNotify:${tag}] alert failed`, e);
    }
    channel = "alert";
  }

  if (log) {
    try {
      await db.clientMessage.create({
        data: {
          orderId: log.orderId,
          visitId: log.visitId ?? null,
          event: log.event,
          subject: subject,
          channel,
          delivered: channel === "telegram" || channel === "email",
        },
      });
    } catch (e) {
      console.error(`[bookingNotify:${tag}] log failed`, e);
    }
  }

  return channel;
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
        locale: true,
        visits: { where: { index: 1 }, select: { scheduledAt: true }, take: 1 },
      },
    });
    if (!order) return;

    const visit = order.visits[0];
    if (!visit?.scheduledAt) return;

    const locale = order.locale || "ru";
    const tmpl = await getOrderTemplates();
    const text = fill(tmpl.created, {
      serviceName: serviceTitle(order.config),
      date: ymd(visit.scheduledAt),
      time: hm(visit.scheduledAt),
      address: addrLine(order.addressSnapshot),
      price: amd(order.firstVisitPrice),
    });
    const subject = await mailSubject(locale, "subjectCreated", { n: order.number });

    await sendToClient(order.userId, text, subject, "client:created", {
      orderId,
      event: "created",
    }, locale);
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
            id: true,
            number: true,
            userId: true,
            config: true,
            locale: true,
          },
        },
      },
    });
    if (!visit?.scheduledAt || !visit.master || !visit.masterId) return;

    const eventKey = `masterAssigned:${visit.masterId}`;
    const ok = await markVisitEvent(visitId, eventKey);
    if (!ok) return;

    const locale = visit.order.locale || "ru";
    const tmpl = await getOrderTemplates();
    const masterName = tr(visit.master.name, "ru");
    const text = fill(tmpl.masterAssigned, {
      serviceName: serviceTitle(visit.order.config),
      date: ymd(visit.scheduledAt),
      time: hm(visit.scheduledAt),
      masterName,
    });
    const subject = await mailSubject(locale, "subjectMasterAssigned", { n: visit.order.number });

    await sendToClient(visit.order.userId, text, subject, "client:masterAssigned", {
      orderId: visit.order.id,
      visitId,
      event: `masterAssigned:${visit.masterId}`,
    }, locale);
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
            id: true,
            number: true,
            userId: true,
            config: true,
            addressSnapshot: true,
            locale: true,
          },
        },
      },
    });
    if (!visit?.scheduledAt) return;

    // Ключ включает дату назначения: повторный перенос на другую дату даёт новое уведомление
    const eventKey = `rescheduled:${visit.scheduledAt.toISOString()}`;
    const ok = await markVisitEvent(visitId, eventKey);
    if (!ok) return;

    const locale = visit.order.locale || "ru";
    const tmpl = await getOrderTemplates();
    const text = fill(tmpl.rescheduled, {
      serviceName: serviceTitle(visit.order.config),
      date: ymd(visit.scheduledAt),
      time: hm(visit.scheduledAt),
      address: addrLine(visit.order.addressSnapshot),
    });
    const subject = await mailSubject(locale, "subjectRescheduled", { n: visit.order.number });

    await sendToClient(visit.order.userId, text, subject, "client:rescheduled", {
      orderId: visit.order.id,
      visitId,
      event: `rescheduled:${visit.scheduledAt.toISOString()}`,
    }, locale);
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
        locale: true,
        visits: {
          where: { status: "CANCELLED" },
          orderBy: { scheduledAt: "asc" },
          select: { scheduledAt: true },
          take: 1,
        },
      },
    });
    if (!order) return;

    const locale = order.locale || "ru";
    const visit = order.visits[0];
    const dateStr = visit?.scheduledAt ? ymd(visit.scheduledAt) : "—";

    const tmpl = await getOrderTemplates();
    const text = fill(tmpl.cancelled, {
      serviceName: serviceTitle(order.config),
      date: dateStr,
    });
    const subject = await mailSubject(locale, "subjectCancelled", { n: order.number });

    await sendToClient(order.userId, text, subject, "client:cancelled", {
      orderId,
      event: "cancelled",
    }, locale);
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
            id: true,
            number: true,
            userId: true,
            config: true,
            locale: true,
          },
        },
      },
    });
    if (!visit) return;

    const locale = visit.order.locale || "ru";
    const dateStr = visit.scheduledAt ? ymd(visit.scheduledAt) : "—";
    const tmpl = await getOrderTemplates();
    const text = fill(tmpl.cancelled, {
      serviceName: serviceTitle(visit.order.config),
      date: dateStr,
    });
    const subject = await mailSubject(locale, "subjectVisitCancelled", { n: visit.order.number, date: dateStr });

    await sendToClient(visit.order.userId, text, subject, "client:visitCancelled", {
      orderId: visit.order.id,
      visitId,
      event: "cancelled",
    }, locale);
  } catch (e) {
    console.error("[bookingNotify:visitCancelled] ошибка", e);
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
            id: true,
            number: true,
            userId: true,
            locale: true,
          },
        },
      },
    });
    if (!visit) return;

    const locale = visit.order.locale || "ru";
    const masterName = visit.master ? tr(visit.master.name, "ru") : "—";
    const appUrl = process.env.APP_URL || "";
    const token = await createReviewToken(visitId);
    const reviewLink = `${appUrl}/${locale}/review/${token}`;

    const tmpl = await getOrderTemplates();
    const text = fill(tmpl.completed, {
      masterName,
      reviewLink,
    });
    const subject = await mailSubject(locale, "subjectCompleted", { n: visit.order.number });

    await sendToClient(visit.order.userId, text, subject, "client:completed", {
      orderId: visit.order.id,
      visitId,
      event: "completed",
    }, locale);
  } catch (e) {
    console.error("[bookingNotify:completed] ошибка", e);
  }
}
