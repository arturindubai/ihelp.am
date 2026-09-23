// Подключает токен Telegram-бота (AUTH-10) без ручного ввода в админке и сразу регистрирует вебхук.
// Токен НЕ передаётся аргументом (виден в `ps`) — только путём к файлу, который скрипт сам не печатает.
// Не использует src/server/settings.ts и services/telegramBot.ts — они импортируют "server-only",
// который бросает исключение вне сборки Next.js. Логика продублирована в упрощённом виде: то же
// шифрование (src/lib/crypto.ts), тот же формат секции "notify" и тот же секрет вебхука.
// npx tsx scripts/connect-telegram-bot.mts <путь-к-файлу-с-токеном>
import { readFileSync } from "fs";
import { db } from "../src/server/db";
import { encrypt } from "../src/lib/crypto";
import { telegramWebhookSecret } from "../src/lib/telegramAuth";

const tokenPath = process.argv[2];
if (!tokenPath) {
  console.error("Usage: npx tsx scripts/connect-telegram-bot.mts <token-file>");
  process.exit(1);
}
const token = readFileSync(tokenPath, "utf8").trim();
if (!token) {
  console.error("Файл с токеном пуст");
  process.exit(1);
}

const encKey = process.env.SETTINGS_ENCRYPTION_KEY;
if (!encKey) {
  console.error("SETTINGS_ENCRYPTION_KEY не задан в .env");
  process.exit(1);
}

const appUrl = process.env.APP_URL;
if (!appUrl || !appUrl.startsWith("https://")) {
  console.error("APP_URL не задан или не https — вебхук Telegram работает только по https");
  process.exit(1);
}

interface NotifySettings {
  telegramBotToken: string;
  telegramChatId: string;
  techChatId: string;
}

const row = await db.setting.findUnique({ where: { key: "notify" } });
const current = (row?.value as unknown as NotifySettings | undefined) ?? { telegramBotToken: "", telegramChatId: "", techChatId: "" };
const next: NotifySettings = { ...current, telegramBotToken: encrypt(token, encKey) };
await db.setting.upsert({ where: { key: "notify" }, create: { key: "notify", value: next }, update: { value: next } });
console.log("[tg] токен сохранён в настройках (зашифрован)");

async function tg<T = unknown>(method: string, payload: object): Promise<T> {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  const json = (await r.json().catch(() => null)) as { ok: boolean; result?: T; description?: string } | null;
  if (!r.ok || !json?.ok) throw new Error(json?.description || `HTTP ${r.status}`);
  return json.result as T;
}

const secret = telegramWebhookSecret(process.env.SESSION_SECRET || "dev");
const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;
await tg("setWebhook", { url: webhookUrl, secret_token: secret, allowed_updates: ["message"] });
const me = await tg<{ username?: string }>("getMe", {});
console.log(`[tg] вебхук зарегистрирован: ${webhookUrl}`);
console.log(`[tg] бот: @${me.username}`);

await db.$disconnect();
