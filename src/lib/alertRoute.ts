/**
 * Куда слать тех-алерт. Обычно — бот и чат из настроек (база). Если база недоступна и настройки не прочитать,
 * алерт уходит через запасной бот из переменных окружения ALERT_BOT_TOKEN и ALERT_CHAT_ID (.env, в репозиторий не попадает).
 */
export interface NotifySettings {
  telegramBotToken: string;
  telegramChatId: string;
  techChatId: string;
  teamChatId?: string;
}

export interface TeamSettings {
  botToken: string;
  members: unknown[];
}

/**
 * Есть ли хотя бы один адресат для тех-алертов.
 * Единая проверка: используется в notifyTech, /api/health?check=alert и systemStatus.
 * Если чат не задан, но есть привязанные члены команды — алерт дойдёт в личку.
 */
export function hasAlertRecipient(notify: NotifySettings, team: TeamSettings): boolean {
  const token = team.botToken || notify.telegramBotToken;
  if (!token) return false;
  if (notify.techChatId || notify.teamChatId || notify.telegramChatId) return true;
  return team.members.length > 0;
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
