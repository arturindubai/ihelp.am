/**
 * Куда слать тех-алерт. Обычно — бот и чат из настроек (база). Если база недоступна и настройки не прочитать,
 * алерт уходит через запасной бот из переменных окружения ALERT_BOT_TOKEN и ALERT_CHAT_ID (.env, в репозиторий не попадает).
 */
export interface NotifySettings {
  telegramBotToken: string;
  telegramChatId: string;
  techChatId: string;
}

export interface AlertRoute {
  token: string;
  chatId: string;
  via: "settings" | "env";
}

/** notify — настройки уведомлений или null, если их не удалось прочитать; env — переменные окружения; null в ответе — слать некуда */
export function pickTechRoute(notify: NotifySettings | null, env: Record<string, string | undefined>): AlertRoute | null {
  if (notify) return { token: notify.telegramBotToken, chatId: notify.techChatId || notify.telegramChatId, via: "settings" };
  const token = env.ALERT_BOT_TOKEN?.trim() ?? "";
  const chatId = env.ALERT_CHAT_ID?.trim() ?? "";
  return token && chatId ? { token, chatId, via: "env" } : null;
}
