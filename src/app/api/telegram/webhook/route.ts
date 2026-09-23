import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { normalizePhone } from "@/lib/phone";
import { verifyTelegramWebhookSecret } from "@/lib/telegramAuth";
import { signState } from "@/server/services/oauth";
import { packSignupTicket } from "@/server/services/signupTicket";
import { sendChatMessage } from "@/server/services/telegramBot";

/**
 * Вебхук Telegram-бота — вход через бота (задача AUTH-10). Существующий пользователь жмёт
 * «Поделиться номером» — телефон уже подтверждён Telegram, бот сразу присылает одноразовую
 * ссылку входа (10 минут, /api/auth/telegram/callback). Новый номер (AUTH-11) — на телефон от
 * бота не полагаемся как на единственное подтверждение: ссылка ведёт на страницу входа с
 * тикетом, там номер всё равно проходит через SMS-код, плюс потребуется email.
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
    if (!phone) return NextResponse.json({ ok: true });
    const user = await db.user.findUnique({ where: { phone } });
    const base = (process.env.APP_URL || "").replace(/\/$/, "");

    if (user?.blocked) {
      await sendChatMessage(msg.chat.id, "Этот номер заблокирован в iHelp.");
      return NextResponse.json({ ok: true });
    }
    if (!user) {
      // Номер не найден — не аккаунт, а начало регистрации (AUTH-11): телефон всё равно
      // подтвердится SMS-кодом на сайте, Telegram здесь только подсказал номер для автозаполнения.
      const ticket = packSignupTicket({ kind: "new", phone, email: "", locale: "ru" });
      const link = `${base}/ru/login?complete=${encodeURIComponent(ticket)}`;
      await sendChatMessage(msg.chat.id, `Этот номер ещё не зарегистрирован в iHelp. Перейдите по ссылке, чтобы завершить регистрацию — телефон и почта потребуются на сайте (ссылка активна 10 минут):\n${link}`);
      return NextResponse.json({ ok: true });
    }

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
