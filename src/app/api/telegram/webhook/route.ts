import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { normalizePhone } from "@/lib/phone";
import { ownPhoneFromContact, verifyTelegramWebhookSecret, type TelegramContactMessage } from "@/lib/telegramAuth";
import { packSignupTicket } from "@/lib/signupTicket";
import { signState } from "@/server/services/oauth";
import { sendChatMessage } from "@/server/services/telegramBot";
import { loadMessages, type Msg } from "@/i18n/messages";

/**
 * Вебхук Telegram-бота — вход через бота (задача AUTH-10). Сотрудник или клиент открывает бота,
 * жмёт «Поделиться номером»; телефон уже подтверждён Telegram, поэтому бот сразу присылает
 * одноразовую ссылку входа (10 минут, /api/auth/telegram/callback).
 * Новый номер (AUTH-11) — бот присылает ссылку на завершение регистрации: телефон подтверждён Telegram,
 * на сайте останутся имя и email с кодом из письма.
 * Два условия безопасности: X-Telegram-Bot-Api-Secret-Token обязателен (без него любой прислал бы
 * чужой номер прямо в этот роут), а контакт должен быть собственным контактом отправителя
 * (ownPhoneFromContact, AUTH-13) — иначе чужой контакт из адресной книги даёт вход в чужой аккаунт.
 */
interface TelegramUpdate {
  message?: TelegramContactMessage & { text?: string; from?: { id: number; language_code?: string } };
}

/** Определяет локаль по Telegram language_code: "hy" → "am", известные → без изменений, иначе "ru" */
function detectLocale(languageCode?: string): string {
  if (!languageCode) return "ru";
  if (languageCode === "hy") return "am";
  if (languageCode === "en") return "en";
  if (languageCode.startsWith("ru")) return "ru";
  return "ru";
}

/** Берёт секцию notify.bot из загруженных сообщений */
function botMsgs(msgs: Msg): Record<string, string> {
  const notify = msgs.notify as Msg | undefined;
  return ((notify?.bot ?? {}) as Record<string, string>);
}

/** Простая подстановка параметров без HTML-экранирования (Telegram plain text) */
function fill(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), v), template);
}

export async function POST(req: Request) {
  if (!verifyTelegramWebhookSecret(req.headers.get("x-telegram-bot-api-secret-token"), process.env.SESSION_SECRET || "dev")) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  const msg = update?.message;
  if (!msg) return NextResponse.json({ ok: true });

  const locale = detectLocale(msg.from?.language_code);
  const msgs = await loadMessages(locale);
  const bot = botMsgs(msgs);
  const contactKeyboard = { keyboard: [[{ text: bot.sharePhone || "📱", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true };

  if (msg.contact) {
    const raw = ownPhoneFromContact(msg);
    if (!raw) {
      await sendChatMessage(msg.chat.id, bot.wrongContact || "", contactKeyboard);
      return NextResponse.json({ ok: true });
    }
    const phone = normalizePhone(raw);
    if (!phone) return NextResponse.json({ ok: true });
    const user = await db.user.findUnique({ where: { phone } });
    const base = (process.env.APP_URL || "").replace(/\/$/, "");
    if (user?.blocked) {
      await sendChatMessage(msg.chat.id, bot.blocked || "");
      return NextResponse.json({ ok: true });
    }
    if (!user) {
      const userLocale = locale === "am" ? "am" : locale === "en" ? "en" : "ru";
      const ticket = packSignupTicket({ phone, locale: userLocale }, process.env.SESSION_SECRET || "dev");
      const link = `${base}/${userLocale}/login?complete=${encodeURIComponent(ticket)}`;
      await sendChatMessage(msg.chat.id, fill(bot.newUser || "{link}", { link }));
      return NextResponse.json({ ok: true });
    }
    const token = signState(user.id, process.env.SESSION_SECRET || "dev");
    const link = `${base}/api/auth/telegram/callback?token=${encodeURIComponent(token)}`;
    await sendChatMessage(msg.chat.id, fill(bot.existingUser || "{link}", { link }));
    return NextResponse.json({ ok: true });
  }

  // /start приходит и с параметром (ссылка t.me/бот?start=login с сайта)
  if (msg.text === "/login" || msg.text?.split(" ")[0] === "/start") {
    await sendChatMessage(msg.chat.id, bot.greeting || "", contactKeyboard);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
