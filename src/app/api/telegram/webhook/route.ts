import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { normalizePhone } from "@/lib/phone";
import { ownPhoneFromContact, verifyTelegramWebhookSecret, type TelegramContactMessage } from "@/lib/telegramAuth";
import { packSignupTicket } from "@/lib/signupTicket";
import { signState } from "@/server/services/oauth";
import { sendChatMessage } from "@/server/services/telegramBot";

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
  message?: TelegramContactMessage & { text?: string };
}

const CONTACT_KEYBOARD = { keyboard: [[{ text: "📱 Поделиться номером", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true };

export async function POST(req: Request) {
  if (!verifyTelegramWebhookSecret(req.headers.get("x-telegram-bot-api-secret-token"), process.env.SESSION_SECRET || "dev")) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  const msg = update?.message;
  if (!msg) return NextResponse.json({ ok: true });

  if (msg.contact) {
    const raw = ownPhoneFromContact(msg);
    if (!raw) {
      await sendChatMessage(msg.chat.id, "Отправьте свой номер кнопкой «📱 Поделиться номером» под этим сообщением — так Telegram подтверждает, что номер ваш. Чужие и пересланные контакты не подходят.", CONTACT_KEYBOARD);
      return NextResponse.json({ ok: true });
    }
    const phone = normalizePhone(raw);
    if (!phone) return NextResponse.json({ ok: true });
    const user = await db.user.findUnique({ where: { phone } });
    const base = (process.env.APP_URL || "").replace(/\/$/, "");
    if (user?.blocked) {
      await sendChatMessage(msg.chat.id, "Этот номер заблокирован в iHelp.");
      return NextResponse.json({ ok: true });
    }
    if (!user) {
      const ticket = packSignupTicket({ phone, locale: "ru" }, process.env.SESSION_SECRET || "dev");
      const link = `${base}/ru/login?complete=${encodeURIComponent(ticket)}`;
      await sendChatMessage(msg.chat.id, `Этого номера ещё нет в iHelp. Номер подтверждён — завершите регистрацию по ссылке: понадобятся имя и email (ссылка действует 10 минут):\n${link}`);
      return NextResponse.json({ ok: true });
    }
    const token = signState(user.id, process.env.SESSION_SECRET || "dev");
    const link = `${base}/api/auth/telegram/callback?token=${encodeURIComponent(token)}`;
    await sendChatMessage(msg.chat.id, `Вход в iHelp — ссылка одноразовая, действует 10 минут:\n${link}`);
    return NextResponse.json({ ok: true });
  }

  // /start приходит и с параметром (ссылка t.me/бот?start=login с сайта)
  if (msg.text === "/login" || msg.text?.split(" ")[0] === "/start") {
    await sendChatMessage(msg.chat.id, "Здравствуйте! Нажмите кнопку ниже: Telegram подтвердит ваш номер, и вы войдёте в iHelp или зарегистрируетесь.", CONTACT_KEYBOARD);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
