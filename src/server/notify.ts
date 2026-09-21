import "server-only";
import { getSettings } from "./settings";

export { html } from "@/lib/html";

/**
 * Отправка в Telegram-чат ботом. Текст — разметка HTML: значения подставлять через html`…` (экранирование).
 * Не бросает ошибок и не ждёт Telegram дольше 5 секунд — оформление заказа не должно зависеть от мессенджера.
 */
async function send(chatId: string, text: string, tag: string) {
  let token = "";
  try {
    token = (await getSettings()).notify.telegramBotToken;
  } catch (e) {
    console.error(`[notify:${tag}] настройки недоступны`, e, "|", text);
    return;
  }
  if (!token || !chatId) {
    console.log(`[notify:${tag}]`, text);
    return;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) console.error(`[notify:${tag}] telegram ${r.status}`, (await r.text()).slice(0, 300), "|", text);
  } catch (e) {
    console.error(`[notify:${tag}] failed`, e, "|", text);
  }
}

/** Уведомления команде: заказы, отмены, переносы, отзывы (бот → группа операторов) */
export async function notifyTeam(text: string) {
  try {
    const s = await getSettings();
    await send(s.notify.telegramChatId, text, "team");
  } catch (e) {
    console.error("[notify:team] не отправлено", e, "|", text);
  }
}

/** Технические алерты: ошибки, бэкапы, диск. Отдельный чат, если задан, иначе — чат команды */
export async function notifyTech(text: string) {
  try {
    const s = await getSettings();
    await send(s.notify.techChatId || s.notify.telegramChatId, text, "tech");
  } catch (e) {
    console.error("[notify:tech] не отправлено", e, "|", text);
  }
}
