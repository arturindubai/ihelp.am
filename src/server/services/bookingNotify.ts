import "server-only";
import { db } from "../db";
import { escapeHtml } from "@/lib/html";
import { sendTelegramDirect } from "./notifyQueue";
import { getSettings, getUiOverrides } from "../settings";
import { tr } from "@/i18n/locales";
import { hm, ymd, isQuietHour } from "@/lib/time";
import { amd, dateLabel, timeLabel } from "@/lib/format";
import { sendMail, mailTemplate } from "./mail";
import { notifyTech, html } from "../notify";
import { alertTech } from "../alerts";
import { createUnsubscribeToken } from "@/lib/emailToken";
import { createReviewToken } from "./reviews";
import { getEmailBannerHtml } from "./banners";
import { loadMessages } from "@/i18n/messages";
import defaultTemplates from "../../../messages/ru.json";
import enMessages from "../../../messages/en.json";

const APP_URL = () => (process.env.APP_URL || "https://ihelp.am").replace(/\/$/, "");

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

function serviceTitle(config: unknown, locale = "ru"): string {
  const c = config as Config | null;
  const svc = tr(c?.service?.title, locale);
  const plan = tr(c?.plan?.title ?? null, locale);
  return [svc, plan].filter(Boolean).join(" · ");
}

/** Подставить параметры в шаблон, значения экранированы для Telegram HTML */
function fill(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), escapeHtml(v)), template);
}

/** Подставить параметры в шаблон без экранирования (для строк, которые затем экранирует mailTemplate) */
function fillPlain(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), v), template);
}

/** Шаблоны уведомлений с учётом правок из Админки → Переводы */
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

/** Клиентские шаблоны с поддержкой локали (для писем reminders/reviews) */
function clientTemplates(locale: string): typeof defaultTemplates.notify.client {
  return (locale === "en" ? (enMessages.notify as typeof defaultTemplates.notify)?.client : null) ?? defaultTemplates.notify.client;
}

/** HMAC-подписанная ссылка отписки от писем */
function unsubscribeUrl(userId: string): string {
  return `${APP_URL()}/api/email/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(userId))}`;
}

/** HTML-подвал письма со ссылкой отписки */
function unsubscribeFooterHtml(userId: string, locale: string): string {
  const tmpl = clientTemplates(locale);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const link = `<a href="${unsubscribeUrl(userId)}" style="color:#78716c">${esc(tmpl.unsubscribeLink)}</a>`;
  return esc(tmpl.unsubscribeText).replace("{link}", link);
}

/** Выбор канала для cron-уведомлений: Telegram → email → none.
 *  Проверяет emailUnsubscribedAt и настройки почты. */
async function selectClientChannel(user: {
  id: string;
  telegramId: string | null;
  email: string | null;
  emailUnsubscribedAt: Date | null;
}) {
  const s = await getSettings();
  if (user.telegramId && s.notify.telegramBotToken) {
    return { channel: "telegram" as const, token: s.notify.telegramBotToken, telegramId: user.telegramId };
  }
  if (user.email && !user.emailUnsubscribedAt && s.mail.enabled && s.mail.apiKey && s.mail.from) {
    return { channel: "email" as const, email: user.email };
  }
  return { channel: "none" as const };
}

/** Отправить клиентское уведомление по наиболее доступному каналу:
 *  Telegram (прямая отправка, при сбое — fallback) → email → алерт оператору.
 *  Проверка emailUnsubscribedAt здесь не производится: письма о заказе приходят всегда.
 *  Только необязательные письма (напоминания, отзыв) блокируются флагом в selectClientChannel. */
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
    select: { telegramId: true, email: true, name: true, emailUnsubscribedAt: true },
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
        const plainText = text
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");
        const lines = plainText.split("\n").filter(Boolean);
        const footer = unsubscribeFooterHtml(userId, locale);
        const bannerHtml = await getEmailBannerHtml(locale).catch(() => null);
        const htmlBody = mailTemplate({ title: subject, lines, brand, footer, ...(bannerHtml ? { bannerHtml } : {}) });
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
      await notifyTech(html`⚠️ Нет канала доставки для уведомления: ${subject}`);
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

    // Сбрасываем напоминание: при переносе клиент должен получить новое
    await db.visit.update({ where: { id: visitId }, data: { remindedAt: null } });

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


/** 4б. Мастер выехал (статус ON_WAY) — уведомление с примерным временем прибытия */
export async function notifyClientMasterOnWay(visitId: string, etaMin: number): Promise<void> {
  const ok = await markVisitEvent(visitId, "onWay");
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
    const tmpl = await getOrderTemplates();
    const text = fill(tmpl.onWay, { masterName, eta: String(etaMin) });

    await sendToClient(visit.order.userId, text, `Мастер выехал — заказ №${visit.order.number}`, "client:onWay", {
      orderId: visit.order.id,
      visitId,
      event: "onWay",
    });
  } catch (e) {
    console.error("[bookingNotify:onWay] ошибка", e);
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
    const token = await createReviewToken(visitId);
    const reviewLink = `${APP_URL()}/${locale}/review/${token}`;

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

/** 6. Напоминания о визитах: визиты через 22–26 часов с remindedAt=null.
 *  Вызывается из cron каждые 15 минут. В тихий период (по умолчанию 21:00–09:00 Ереван) не отправляет. */
export async function sendVisitReminders(now: Date): Promise<number> {
  const s0 = await getSettings();
  if (isQuietHour(now, s0.notify.quietHourStart, s0.notify.quietHourEnd)) return 0;

  const from = new Date(now.getTime() + 22 * 3600_000);
  const to = new Date(now.getTime() + 26 * 3600_000);

  const visits = await db.visit.findMany({
    where: {
      scheduledAt: { gte: from, lte: to },
      status: { in: ["SCHEDULED", "CONFIRMED"] },
      remindedAt: null,
    },
    select: {
      id: true,
      scheduledAt: true,
      order: {
        select: {
          number: true,
          config: true,
          addressSnapshot: true,
          locale: true,
          userId: true,
          user: { select: { id: true, telegramId: true, email: true, emailUnsubscribedAt: true } },
        },
      },
      master: { select: { name: true } },
    },
  });

  let sent = 0;
  for (const v of visits) {
    if (!v.scheduledAt || !v.order.user) continue;

    // Актуальная проверка статуса перед отправкой
    const liveVisit = await db.visit.findUnique({
      where: { id: v.id },
      select: { status: true, order: { select: { status: true } } },
    });
    if (!liveVisit || liveVisit.status === "CANCELLED" || liveVisit.order.status === "CANCELLED") {
      await db.visit.update({ where: { id: v.id }, data: { remindedAt: new Date() } });
      continue;
    }

    const locale = v.order.locale || "ru";
    const ch = await selectClientChannel(v.order.user);
    if (ch.channel === "none") {
      await db.visit.update({ where: { id: v.id }, data: { remindedAt: new Date() } });
      continue;
    }

    const tmpl = clientTemplates(locale);
    const brand = (await getSettings()).brand.name || "iHelp";
    const service = serviceTitle(v.order.config, locale);
    const date = dateLabel(v.scheduledAt, locale);
    const time = timeLabel(v.scheduledAt);
    const address = addrLine(v.order.addressSnapshot);
    const master = v.master ? tr(v.master.name, locale) : "—";

    try {
      let deliveryOk = false;
      if (ch.channel === "telegram") {
        // fill() уже экранирует параметры — не оборачивать в html``, иначе экранирование двойное
        const text =
          `📅 <b>${fill(tmpl.reminder.title, {})}</b>\n` +
          `${fill(tmpl.reminder.service, { service })}\n` +
          `${fill(tmpl.reminder.date, { date, time })}\n` +
          `${fill(tmpl.reminder.master, { master })}\n` +
          `${fill(tmpl.reminder.address, { address })}`;
        await sendTelegramDirect(ch.token, ch.telegramId, text);
        deliveryOk = true;
      } else {
        const lines = [
          fillPlain(tmpl.reminder.service, { service }),
          fillPlain(tmpl.reminder.date, { date, time }),
          fillPlain(tmpl.reminder.master, { master }),
          fillPlain(tmpl.reminder.address, { address }),
        ];
        const htmlBody = mailTemplate({
          brand,
          title: tmpl.reminder.title,
          lines,
          footer: unsubscribeFooterHtml(v.order.user.id, locale),
          button: { text: tmpl.reminder.button, url: `${APP_URL()}/${locale}/account/orders` },
        });
        const r = await sendMail({ to: ch.email, subject: tmpl.reminder.subject, html: htmlBody });
        if (r.ok) {
          deliveryOk = true;
        } else {
          console.error(`[bookingNotify:reminder] не отправлено visit=${v.id}`, r.error);
        }
      }
      if (deliveryOk) {
        await db.visit.update({ where: { id: v.id }, data: { remindedAt: new Date() } });
        sent++;
      }
    } catch (e) {
      console.error(`[bookingNotify:reminder] ошибка visit=${v.id}`, e);
      await alertTech(
        `bookingNotify:reminder:${v.id}`,
        html`❌ Напоминание не отправлено\nВизит ${v.id}\n<code>${String((e as Error).message ?? e).slice(0, 200)}</code>`,
        60,
      );
    }
  }
  return sent;
}

/** 7. Запросы отзыва: визиты со статусом DONE, finishedAt 2–18 часов назад, reviewRequestedAt=null.
 *  18 часов (вместо 6) гарантируют, что вечерние визиты дождутся утра и всё равно получат просьбу.
 *  Вызывается из cron каждые 15 минут. В тихий период (по умолчанию 21:00–09:00 Ереван) не отправляет. */
export async function sendReviewRequests(now: Date): Promise<number> {
  const s0 = await getSettings();
  if (isQuietHour(now, s0.notify.quietHourStart, s0.notify.quietHourEnd)) return 0;

  const from = new Date(now.getTime() - 18 * 3600_000);
  const to = new Date(now.getTime() - 2 * 3600_000);

  const visits = await db.visit.findMany({
    where: {
      status: "DONE",
      finishedAt: { gte: from, lte: to },
      reviewRequestedAt: null,
      review: null,
    },
    select: {
      id: true,
      order: {
        select: {
          id: true,
          locale: true,
          userId: true,
          user: { select: { id: true, telegramId: true, email: true, emailUnsubscribedAt: true } },
        },
      },
    },
  });

  let sent = 0;
  for (const v of visits) {
    if (!v.order.user) continue;

    const locale = v.order.locale || "ru";
    const ch = await selectClientChannel(v.order.user);
    if (ch.channel === "none") {
      await db.visit.update({ where: { id: v.id }, data: { reviewRequestedAt: new Date() } });
      continue;
    }

    const tmpl = clientTemplates(locale);
    const brand = (await getSettings()).brand.name || "iHelp";
    const reviewToken = await createReviewToken(v.id);
    const reviewUrl = `${APP_URL()}/${locale}/review/${reviewToken}`;

    try {
      let deliveryOk = false;
      if (ch.channel === "telegram") {
        const text = html`⭐ <b>${tmpl.review.title}</b>\n${tmpl.review.line1}\n${reviewUrl}`;
        await sendTelegramDirect(ch.token, ch.telegramId, text);
        deliveryOk = true;
      } else {
        const htmlBody = mailTemplate({
          brand,
          title: tmpl.review.title,
          lines: [tmpl.review.line1, tmpl.review.line2],
          footer: unsubscribeFooterHtml(v.order.user.id, locale),
          button: { text: tmpl.review.button, url: reviewUrl },
        });
        const r = await sendMail({ to: ch.email, subject: tmpl.review.subject, html: htmlBody });
        if (r.ok) {
          deliveryOk = true;
        } else {
          console.error(`[bookingNotify:review] не отправлено visit=${v.id}`, r.error);
        }
      }
      if (deliveryOk) {
        await db.visit.update({ where: { id: v.id }, data: { reviewRequestedAt: new Date() } });
        sent++;
      }
    } catch (e) {
      console.error(`[bookingNotify:review] ошибка visit=${v.id}`, e);
      await alertTech(
        `bookingNotify:review:${v.id}`,
        html`❌ Запрос отзыва не отправлен\nВизит ${v.id}\n<code>${String((e as Error).message ?? e).slice(0, 200)}</code>`,
        60,
      );
    }
  }
  return sent;
}

/** 8. Напоминания клиентам за 2 часа до визита (окно 20–150 минут).
 *  Нижняя граница 20 мин вместо 90: визиты в 09:30–10:30 не попадают в стандартное окно 90–150 мин,
 *  потому что оно целиком лежит в тихом периоде — сразу после 09:00 их нужно поймать.
 *  Дедупликация через clientNotifiedEvents с ключом "reminder2h" гарантирует одно напоминание.
 *  В тихий период (notify.quietHourStart–quietHourEnd) — не отправляет. */
export async function sendVisit2hReminders(now: Date): Promise<number> {
  const s0 = await getSettings();
  if (isQuietHour(now, s0.notify.quietHourStart, s0.notify.quietHourEnd)) return 0;

  const from = new Date(now.getTime() + 20 * 60_000);
  const to = new Date(now.getTime() + 150 * 60_000);

  const visits = await db.visit.findMany({
    where: {
      scheduledAt: { gte: from, lte: to },
      status: { in: ["SCHEDULED", "CONFIRMED"] },
    },
    select: {
      id: true,
      scheduledAt: true,
      clientNotifiedEvents: true,
      order: {
        select: {
          number: true,
          config: true,
          addressSnapshot: true,
          locale: true,
          userId: true,
          user: { select: { id: true, telegramId: true, email: true, emailUnsubscribedAt: true } },
        },
      },
      master: { select: { name: true } },
    },
  });

  let sent = 0;
  for (const v of visits) {
    if (!v.scheduledAt || !v.order.user) continue;
    if (v.clientNotifiedEvents.includes("reminder2h")) continue;

    // Актуальная проверка перед отправкой
    const liveVisit = await db.visit.findUnique({
      where: { id: v.id },
      select: { status: true, clientNotifiedEvents: true, order: { select: { status: true } } },
    });
    if (!liveVisit || liveVisit.status === "CANCELLED" || liveVisit.order.status === "CANCELLED") continue;
    if (liveVisit.clientNotifiedEvents.includes("reminder2h")) continue;

    const locale = v.order.locale || "ru";
    const ch = await selectClientChannel(v.order.user);
    if (ch.channel === "none") continue;

    const tmpl = clientTemplates(locale);
    const brand = (await getSettings()).brand.name || "iHelp";
    const service = serviceTitle(v.order.config, locale);
    const date = dateLabel(v.scheduledAt, locale);
    const time = timeLabel(v.scheduledAt);
    const address = addrLine(v.order.addressSnapshot);
    const master = v.master ? tr(v.master.name, locale) : "—";

    try {
      let deliveryOk = false;
      if (ch.channel === "telegram") {
        // fill() уже экранирует параметры — не оборачивать в html``, иначе экранирование двойное
        const text =
          `⏰ <b>${fill(tmpl.reminder2h.title, {})}</b>\n` +
          `${fill(tmpl.reminder2h.service, { service })}\n` +
          `${fill(tmpl.reminder2h.date, { date, time })}\n` +
          `${fill(tmpl.reminder2h.master, { master })}\n` +
          `${fill(tmpl.reminder2h.address, { address })}`;
        await sendTelegramDirect(ch.token, ch.telegramId, text);
        deliveryOk = true;
      } else {
        const lines = [
          fillPlain(tmpl.reminder2h.service, { service }),
          fillPlain(tmpl.reminder2h.date, { date, time }),
          fillPlain(tmpl.reminder2h.master, { master }),
          fillPlain(tmpl.reminder2h.address, { address }),
        ];
        const htmlBody = mailTemplate({
          brand,
          title: tmpl.reminder2h.title,
          lines,
          footer: unsubscribeFooterHtml(v.order.user.id, locale),
          button: { text: tmpl.reminder2h.button, url: `${APP_URL()}/${locale}/account/orders` },
        });
        const r = await sendMail({ to: ch.email, subject: tmpl.reminder2h.subject, html: htmlBody });
        if (r.ok) {
          deliveryOk = true;
        } else {
          console.error(`[bookingNotify:reminder2h] не отправлено visit=${v.id}`, r.error);
        }
      }
      if (deliveryOk) {
        await db.visit.update({ where: { id: v.id }, data: { clientNotifiedEvents: { push: "reminder2h" } } });
        sent++;
      }
    } catch (e) {
      console.error(`[bookingNotify:reminder2h] ошибка visit=${v.id}`, e);
      await alertTech(
        `bookingNotify:reminder2h:${v.id}`,
        html`❌ Напоминание 2ч не отправлено\nВизит ${v.id}\n<code>${String((e as Error).message ?? e).slice(0, 200)}</code>`,
        60,
      );
    }
  }
  return sent;
}
