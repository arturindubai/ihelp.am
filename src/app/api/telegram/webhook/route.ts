import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { normalizePhone } from "@/lib/phone";
import { verifyTelegramWebhookSecret } from "@/lib/telegramAuth";
import { signState } from "@/server/services/oauth";
import { sendChatMessage } from "@/server/services/telegramBot";

/**
 * Вебхук Telegram-бота — вход через бота (задача AUTH-10). Сотрудник или клиент открывает бота,
 * жмёт «Поделиться номером»; телефон уже подтверждён Telegram, поэтому бот сразу присылает
 * одноразовую ссылку входа (10 минут, /api/auth/telegram/callback).
 * X-Telegram-Bot-Api-Secret-Token обязателен: без него любой мог бы прислать чужой номер
 * телефона напрямую в этот роут и получить ссылку входа в свой чат.
 */
interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
    contact?: { phone_number: string };
  };
}

const CONTACT_KEYBOARD = { keyboard: [[{ text: "📱 Поделиться номером", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true };

export async function POST(req: Request) {
  if (!verifyTelegramWebhookSecret(req.headers.get("x-telegram-bot-api-secret-token"), process.env.SESSION_SECRET || "dev")) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  const msg = update?.message;
  if (!msg) return NextResponse.json({ ok: true });

  if (msg.contact?.phone_number) {
    const phone = normalizePhone(msg.contact.phone_number);
    const user = phone ? await db.user.findUnique({ where: { phone } }) : null;
    if (!user || user.blocked) {
      await sendChatMessage(msg.chat.id, "Этот номер не найден в iHelp. Сначала войдите на сайте по коду с этим номером, затем возвращайтесь сюда.");
      return NextResponse.json({ ok: true });
    }
    const base = (process.env.APP_URL || "").replace(/\/$/, "");
    const token = signState(user.id, process.env.SESSION_SECRET || "dev");
    const link = `${base}/api/auth/telegram/callback?token=${encodeURIComponent(token)}`;
    await sendChatMessage(msg.chat.id, `Вход в iHelp — ссылка одноразовая, действует 10 минут:\n${link}`);
    return NextResponse.json({ ok: true });
  }

  if (msg.text === "/start" || msg.text === "/login") {
    await sendChatMessage(msg.chat.id, "Здравствуйте! Нажмите кнопку ниже, чтобы войти в iHelp по номеру телефона.", CONTACT_KEYBOARD);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
