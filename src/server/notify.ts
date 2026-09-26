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
 * Прямая отправка в Telegram без очереди — только для notifyTech.
 * При падении базы очередь тоже недоступна, поэтому тех-алерт идёт напрямую.
 */
async function post(token: string, chatId: string, text: string, tag: string) {
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

/**
 * Отправка через очередь с повторными попытками.
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

/**
 * Технические алерты: ошибки, бэкапы, диск. Отдельный чат, если задан, иначе — чат команды.
 * Если база недоступна и настройки не прочитать, алерт уходит через запасной бот из ALERT_BOT_TOKEN и ALERT_CHAT_ID (.env):
 * именно при падении базы алерт нужнее всего.
 * Прямой fetch без очереди: при падении базы записать в очередь тоже нельзя.
 */
export async function notifyTech(text: string) {
  let token = "";
  let chatId = "";
  let via = "tech";
  try {
    const s = await getSettings();
    token = s.team.botToken || s.notify.telegramBotToken;
    chatId = s.notify.techChatId || s.notify.teamChatId || s.notify.telegramChatId;
  } catch (e) {
    console.error("[notify:tech] настройки недоступны, пробую запасной бот", e);
    token = process.env.ALERT_BOT_TOKEN?.trim() ?? "";
    chatId = process.env.ALERT_CHAT_ID?.trim() ?? "";
    via = "tech-fallback";
  }
  if (!token || !chatId) {
    console.error("[notify:tech] не отправлено: настройки недоступны, запасной бот не задан |", text);
    return;
  }
  await post(token, chatId, text, via);
}
