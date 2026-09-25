import "server-only";
import { getSettings } from "./settings";
import { enqueueAndSend } from "./services/notifyQueue";

export { html } from "@/lib/html";

/**
 * Отправка в Telegram-чат ботом через очередь с повторными попытками.
 * Запись добавляется в NotifyQueue до первой попытки — сообщение не теряется при сбое.
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
  await enqueueAndSend(chatId, text, tag, token);
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
