import "server-only";
import { pickTechRoute } from "@/lib/alertRoute";
import { getSettings, type Settings } from "./settings";
import { enqueueAndSend } from "./services/notifyQueue";

export { html } from "@/lib/html";

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

/**
 * Технические алерты: ошибки, бэкапы, диск. Отдельный чат, если задан, иначе — чат команды.
 * Если база недоступна и настройки не прочитать, алерт уходит через запасной бот из ALERT_BOT_TOKEN и ALERT_CHAT_ID (.env):
 * именно при падении базы алерт нужнее всего.
 * Прямой fetch без очереди: при падении базы записать в очередь тоже нельзя.
 */
export async function notifyTech(text: string) {
  let notify: Settings["notify"] | null = null;
  try {
    notify = (await getSettings()).notify;
  } catch (e) {
    console.error("[notify:tech] настройки недоступны, пробую запасной бот", e);
  }
  const route = pickTechRoute(notify, process.env);
  if (!route) {
    console.error("[notify:tech] не отправлено: настройки недоступны, запасной бот не задан |", text);
    return;
  }
  await post(route.token, route.chatId, text, route.via === "env" ? "tech-fallback" : "tech");
}
