import "server-only";
import { db } from "../db";
import { getSettings } from "../settings";
import { sendMail, mailTemplate } from "./mail";
import { alertTech } from "../alerts";
import { html } from "../notify";
import { tr } from "@/i18n/locales";
import { amd, dateLabel, timeLabel } from "@/lib/format";
import { createUnsubscribeToken } from "@/lib/emailToken";
import ru from "../../../messages/ru.json";
import en from "../../../messages/en.json";

const APP_URL = () => (process.env.APP_URL || "https://ihelp.am").replace(/\/$/, "");

type AddressSnapshot = { street?: string; building?: string; apartment?: string };
type OrderConfig = { service?: { title?: unknown }; plan?: { title?: unknown } | null };

function addrLine(snapshot: unknown): string {
  const a = snapshot as AddressSnapshot | null;
  if (!a?.street) return "—";
  return `${a.street} ${a.building ?? ""}${a.apartment ? ", кв. " + a.apartment : ""}`.trim();
}

function serviceTitle(config: unknown, locale: string): string {
  const c = config as OrderConfig | null;
  const svc = tr(c?.service?.title, locale);
  const plan = tr(c?.plan?.title ?? null, locale);
  return [svc, plan].filter(Boolean).join(" · ") || "—";
}

function t(locale: string): typeof ru.notify.client {
  return (locale === "en" ? en.notify?.client : null) ?? ru.notify.client;
}

function fill(s: string, p: Record<string, string>): string {
  return Object.entries(p).reduce((r, [k, v]) => r.replace(new RegExp(`\\{${k}\\}`, "g"), v), s);
}

/** Ссылка для отписки — подписана HMAC, не истекает */
function unsubscribeUrl(userId: string): string {
  return `${APP_URL()}/api/email/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(userId))}`;
}

/** Подвал письма со ссылкой отписки */
function unsubscribeFooter(userId: string, locale: string): string {
  const tmpl = t(locale);
  const link = `<a href="${unsubscribeUrl(userId)}">${tmpl.unsubscribeLink}</a>`;
  return fill(tmpl.unsubscribeText, { link });
}

/** Выбор канала: Telegram-личка через клиентский бот или email.
 *  Возвращает { channel: 'telegram', telegramId } | { channel: 'email', email } | { channel: 'none' } */
async function selectChannel(user: { id: string; telegramId: string | null; email: string | null; emailUnsubscribedAt: Date | null }) {
  const s = await getSettings();
  if (user.telegramId && s.notify.telegramBotToken) {
    return { channel: "telegram" as const, telegramId: user.telegramId };
  }
  if (user.email && !user.emailUnsubscribedAt && s.mail.enabled && s.mail.apiKey && s.mail.from) {
    return { channel: "email" as const, email: user.email };
  }
  return { channel: "none" as const };
}

/** Отправить сообщение клиенту через Telegram (личка через бот уведомлений) */
async function sendViaTelegram(telegramId: string, text: string, tag: string): Promise<void> {
  const s = await getSettings();
  const token = s.notify.telegramBotToken;
  if (!token) return;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.error(`[bookingNotify:${tag}] telegram ${r.status}`, body.slice(0, 200));
      // Telegram 403 = бот заблокирован клиентом; тих пропускаем — это не технический сбой
      if (r.status !== 403) throw new Error(`telegram ${r.status}`);
    }
  } catch (e) {
    console.error(`[bookingNotify:${tag}] telegram error`, e);
    throw e;
  }
}

/** Уведомление клиенту о подтверждении заказа.
 *  Вызывается один раз из createOrder, дедупликация не нужна. */
export async function notifyBookingConfirmed(orderId: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      number: true,
      config: true,
      addressSnapshot: true,
      firstVisitPrice: true,
      locale: true,
      userId: true,
      visits: { where: { index: 1 }, select: { scheduledAt: true }, take: 1 },
      user: { select: { id: true, telegramId: true, email: true, emailUnsubscribedAt: true, name: true } },
    },
  });
  if (!order?.user) return;

  const locale = order.locale || "ru";
  const ch = await selectChannel(order.user);
  if (ch.channel === "none") return;

  const visit = order.visits[0];
  const scheduledAt = visit?.scheduledAt;
  const tmpl = t(locale);
  const brand = (await getSettings()).brand.name || "iHelp";

  const service = serviceTitle(order.config, locale);
  const date = scheduledAt ? dateLabel(scheduledAt, locale) : "—";
  const time = scheduledAt ? timeLabel(scheduledAt) : "—";
  const address = addrLine(order.addressSnapshot);
  const total = amd(order.firstVisitPrice);

  try {
    if (ch.channel === "telegram") {
      const text =
        html`✅ <b>${fill(tmpl.confirmation.title, {})}</b>\n` +
        html`${fill(tmpl.confirmation.service, { service })}\n` +
        html`${fill(tmpl.confirmation.date, { date, time })}\n` +
        html`${fill(tmpl.confirmation.address, { address })}\n` +
        html`${fill(tmpl.confirmation.total, { total })}`;
      await sendViaTelegram(ch.telegramId, text, `confirm:${order.number}`);
    } else {
      const subject = fill(tmpl.confirmation.subject, { number: String(order.number) });
      const htmlBody = mailTemplate({
        brand,
        title: tmpl.confirmation.title,
        lines: [
          fill(tmpl.confirmation.service, { service }),
          fill(tmpl.confirmation.date, { date, time }),
          fill(tmpl.confirmation.address, { address }),
          fill(tmpl.confirmation.total, { total }),
          unsubscribeFooter(order.user.id, locale),
        ],
        button: { text: tmpl.confirmation.button, url: `${APP_URL()}/${locale}/account/orders` },
      });
      const r = await sendMail({ to: ch.email, subject, html: htmlBody });
      if (!r.ok) console.error(`[bookingNotify] письмо не отправлено: заказ #${order.number}`, r.error);
    }
  } catch (e) {
    console.error("[bookingNotify:confirmed] ошибка", e);
  }
}

/** Напоминания о визитах: визиты через 24±2 часа с непустым remindedAt=null.
 *  Вызывается из cron каждые 15 минут. */
export async function sendVisitReminders(now: Date): Promise<number> {
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

    // Актуальная проверка: визит не отменён и заказ не отменён
    const liveVisit = await db.visit.findUnique({ where: { id: v.id }, select: { status: true, order: { select: { status: true } } } });
    if (!liveVisit || liveVisit.status === "CANCELLED" || liveVisit.order.status === "CANCELLED") {
      await db.visit.update({ where: { id: v.id }, data: { remindedAt: new Date() } });
      continue;
    }

    const locale = v.order.locale || "ru";
    const ch = await selectChannel(v.order.user);
    if (ch.channel === "none") {
      await db.visit.update({ where: { id: v.id }, data: { remindedAt: new Date() } });
      continue;
    }

    const tmpl = t(locale);
    const brand = (await getSettings()).brand.name || "iHelp";
    const service = serviceTitle(v.order.config, locale);
    const date = dateLabel(v.scheduledAt, locale);
    const time = timeLabel(v.scheduledAt);
    const address = addrLine(v.order.addressSnapshot);
    const master = v.master ? tr(v.master.name, locale) : "—";

    try {
      if (ch.channel === "telegram") {
        const text =
          html`📅 <b>${fill(tmpl.reminder.title, {})}</b>\n` +
          html`${fill(tmpl.reminder.service, { service })}\n` +
          html`${fill(tmpl.reminder.date, { date, time })}\n` +
          html`${fill(tmpl.reminder.master, { master })}\n` +
          html`${fill(tmpl.reminder.address, { address })}`;
        await sendViaTelegram(ch.telegramId, text, `reminder:${v.id}`);
      } else {
        const htmlBody = mailTemplate({
          brand,
          title: tmpl.reminder.title,
          lines: [
            fill(tmpl.reminder.service, { service }),
            fill(tmpl.reminder.date, { date, time }),
            fill(tmpl.reminder.master, { master }),
            fill(tmpl.reminder.address, { address }),
            unsubscribeFooter(v.order.user.id, locale),
          ],
          button: { text: tmpl.reminder.button, url: `${APP_URL()}/${locale}/account/orders` },
        });
        const r = await sendMail({ to: ch.email, subject: tmpl.reminder.subject, html: htmlBody });
        if (!r.ok) console.error(`[bookingNotify:reminder] не отправлено visit=${v.id}`, r.error);
      }
      await db.visit.update({ where: { id: v.id }, data: { remindedAt: new Date() } });
      sent++;
    } catch (e) {
      console.error(`[bookingNotify:reminder] ошибка visit=${v.id}`, e);
      await alertTech(`bookingNotify:reminder:${v.id}`, html`❌ Напоминание не отправлено\nВизит ${v.id}\n<code>${String((e as Error).message ?? e).slice(0, 200)}</code>`, 60);
    }
  }
  return sent;
}

/** Запросы отзыва: визиты со статусом DONE, finishedAt 2–6 часов назад, reviewRequestedAt=null.
 *  Вызывается из cron каждые 15 минут. */
export async function sendReviewRequests(now: Date): Promise<number> {
  const from = new Date(now.getTime() - 6 * 3600_000);
  const to = new Date(now.getTime() - 2 * 3600_000);

  const visits = await db.visit.findMany({
    where: {
      status: "DONE",
      finishedAt: { gte: from, lte: to },
      reviewRequestedAt: null,
    },
    select: {
      id: true,
      order: {
        select: {
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
    const ch = await selectChannel(v.order.user);
    if (ch.channel === "none") {
      await db.visit.update({ where: { id: v.id }, data: { reviewRequestedAt: new Date() } });
      continue;
    }

    const tmpl = t(locale);
    const brand = (await getSettings()).brand.name || "iHelp";
    const reviewUrl = `${APP_URL()}/${locale}/account/orders`;

    try {
      if (ch.channel === "telegram") {
        const text = html`⭐ <b>${fill(tmpl.review.title, {})}</b>\n${tmpl.review.line1}\n${reviewUrl}`;
        await sendViaTelegram(ch.telegramId, text, `review:${v.id}`);
      } else {
        const htmlBody = mailTemplate({
          brand,
          title: tmpl.review.title,
          lines: [tmpl.review.line1, tmpl.review.line2, unsubscribeFooter(v.order.user.id, locale)],
          button: { text: tmpl.review.button, url: reviewUrl },
        });
        const r = await sendMail({ to: ch.email, subject: tmpl.review.subject, html: htmlBody });
        if (!r.ok) console.error(`[bookingNotify:review] не отправлено visit=${v.id}`, r.error);
      }
      await db.visit.update({ where: { id: v.id }, data: { reviewRequestedAt: new Date() } });
      sent++;
    } catch (e) {
      console.error(`[bookingNotify:review] ошибка visit=${v.id}`, e);
      await alertTech(`bookingNotify:review:${v.id}`, html`❌ Запрос отзыва не отправлен\nВизит ${v.id}\n<code>${String((e as Error).message ?? e).slice(0, 200)}</code>`, 60);
    }
  }
  return sent;
}
