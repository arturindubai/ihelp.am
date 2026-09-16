import "server-only";
import { getSettings } from "./settings";

/** Уведомления команде в Telegram-чат (бот → группа операторов) */
export async function notifyTeam(text: string) {
  try {
    const s = await getSettings();
    const { telegramBotToken, telegramChatId } = s.notify;
    if (!telegramBotToken || !telegramChatId) {
      console.log("[notify:team]", text);
      return;
    }
    await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramChatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
  } catch (e) {
    console.error("[notify:team] failed", e);
  }
}
