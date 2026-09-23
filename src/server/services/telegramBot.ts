import "server-only";
import { getSettings } from "../settings";

/**
 * Вызовы Telegram Bot API помимо простых уведомлений (src/server/notify.ts):
 * вход через бота (AUTH-10) и регистрация вебхука. Токен бота — тот же notify.telegramBotToken,
 * что и для уведомлений команде: один бот умеет и то, и другое.
 */
async function call<T = unknown>(method: string, payload: object): Promise<T | null> {
  const token = (await getSettings()).notify.telegramBotToken;
  if (!token) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await r.json().catch(() => null)) as { ok: boolean; result?: T; description?: string } | null;
    if (!r.ok || !json?.ok) {
      console.error(`[tg-bot] ${method} failed`, r.status, json?.description);
      return null;
    }
    return json.result ?? null;
  } catch (e) {
    console.error(`[tg-bot] ${method} error`, e);
    return null;
  }
}

interface ReplyKeyboard {
  keyboard: { text: string; request_contact?: boolean }[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
}

export const sendChatMessage = (chatId: number | string, text: string, replyMarkup?: ReplyKeyboard) =>
  call("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });

/** Регистрирует адрес вебхука в Telegram — вызывается из админки при подключении входа через бота */
export async function registerTelegramWebhook(appUrl: string, secretToken: string) {
  const url = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;
  const ok = await call<true>("setWebhook", { url, secret_token: secretToken, allowed_updates: ["message"] });
  if (!ok) return { ok: false as const };
  const me = await call<{ username?: string }>("getMe", {});
  return { ok: true as const, username: me?.username };
}
