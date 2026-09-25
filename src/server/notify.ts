import "server-only";
import { getSettings, type Settings } from "./settings";
import { enqueueAndSend } from "./services/notifyQueue";

export { html } from "@/lib/html";

/** Разрешить токен по пути вида «section.field» из объекта настроек */
function resolveToken(s: Settings, tokenPath: string): string {
  const [section, field] = tokenPath.split(".");
  const sec = s[section as keyof Settings];
  if (sec && typeof sec === "object" && !Array.isArray(sec)) {
    return ((sec as Record<string, unknown>)[field] as string) ?? "";
  }
  return "";
}

/**
 * Отправка в Telegram-чат ботом через очередь с повторными попытками.
 * Запись добавляется в NotifyQueue до первой попытки — сообщение не теряется при сбое.
 * tokenPath: путь к токену в настройках, например «team.botToken»
 */
async function send(chatId: string, text: string, tag: string, tokenPath: string) {
  let token = "";
  try {
    token = resolveToken(await getSettings(), tokenPath);
  } catch (e) {
    console.error(`[notify:${tag}] настройки недоступны`, e, "|", text);
    return;
  }
  if (!token || !chatId) {
    console.log(`[notify:${tag}]`, text);
    return;
  }
  await enqueueAndSend(chatId, text, tag, token, tokenPath);
}

/** Уведомления команде: заказы, отмены, переносы, отзывы (бот @ihelp_staff_bot → группа сотрудников) */
export async function notifyTeam(text: string) {
  try {
    const s = await getSettings();
    const chatId = s.notify.teamChatId || s.notify.telegramChatId;
    await send(chatId, text, "team", "team.botToken");
  } catch (e) {
    console.error("[notify:team] не отправлено", e, "|", text);
  }
}

/** Технические алерты: ошибки, бэкапы, диск. Отдельный чат, если задан, иначе — чат команды */
export async function notifyTech(text: string) {
  try {
    const s = await getSettings();
    const chatId = s.notify.techChatId || s.notify.teamChatId || s.notify.telegramChatId;
    await send(chatId, text, "tech", "team.botToken");
  } catch (e) {
    console.error("[notify:tech] не отправлено", e, "|", text);
  }
}
