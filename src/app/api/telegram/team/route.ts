import { NextResponse } from "next/server";
import { handleTeamUpdate, verifyTeamWebhook, type TgUpdate } from "@/server/services/teamBot";

/**
 * Вебхук бота команды (Control Center → «Ключи» → «Подключить»). Отдельный от вебхука бота входа клиентов.
 * X-Telegram-Bot-Api-Secret-Token обязателен: без него любой мог бы завести задачу от имени владельца.
 * Отвечаем 200 всегда, даже при ошибке обработки, — иначе Telegram будет повторять то же сообщение
 */
export async function POST(req: Request) {
  if (!verifyTeamWebhook(req.headers.get("x-telegram-bot-api-secret-token"))) return NextResponse.json({ ok: false }, { status: 401 });
  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  if (update) {
    try {
      await handleTeamUpdate(update);
    } catch (e) {
      console.error("[team-bot] обработка сообщения", e);
    }
  }
  return NextResponse.json({ ok: true });
}
