import "server-only";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { getSettings, saveSettingsSection, type Settings } from "../settings";
import { html } from "../notify";
import { intakeCreate, ccCounts } from "./ccBoard";
import { addAttachment } from "./attachments";
import { getWorkersConfig } from "./workers";

/**
 * Бот команды в Telegram — как бот LIA (lia-tg-poll): владелец и команда пишут задачу → карточка IN-N в очереди
 * триажа; «статус» — сводка; бот сам сообщает, что ждёт решения владельца. Отдельный от бота входа клиентов:
 * свой токен (Control Center → «Ключи»), свой вебхук /api/telegram/team. Задачи принимаются только от
 * привязанных людей команды, в личном чате с ботом
 */

type TeamSettings = Settings["team"];

const base = () => (process.env.APP_URL || "").replace(/\/$/, "");
const LINK_TTL_MS = 30 * 60_000;

/** Секрет вебхука: Telegram возвращает его в заголовке на каждый вызов — чужой запрос без него отклоняется */
export function teamWebhookSecret() {
  return crypto.createHash("sha256").update(`tg-team:${process.env.SESSION_SECRET || "dev"}`).digest("hex");
}

export function verifyTeamWebhook(header: string | null) {
  if (!process.env.SESSION_SECRET) return false;
  const a = Buffer.from(header || "");
  const b = Buffer.from(teamWebhookSecret());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function team(fresh = false): Promise<TeamSettings> {
  return (await getSettings({ fresh })).team;
}

async function saveTeam(patch: Partial<TeamSettings>) {
  const current = await team(true);
  await saveSettingsSection("team", { ...current, ...patch });
}

async function call<T = unknown>(token: string, method: string, payload: object): Promise<{ ok: boolean; result?: T; description?: string }> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const j = ((await r.json().catch(() => null)) as { ok: boolean; result?: T; description?: string }) ?? { ok: false };
    // Отказ Telegram (человек заблокировал бота, неверный токен) — в лог, его видно в Control Center → «Логи». Токена в строке нет
    if (!j.ok) console.warn(`[team-bot] ${method}: ${j.description ?? `HTTP ${r.status}`}`);
    return j;
  } catch (e) {
    console.error(`[team-bot] ${method}`, (e as Error).message);
    return { ok: false, description: "unreachable" };
  }
}

async function reply(chatId: number, text: string) {
  const t = await team();
  if (!t.botToken) return;
  await call(t.botToken, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
}

export class TeamBotError extends Error {}

/** Подключить бота: проверить токен, зарегистрировать вебхук и команды меню. Нужен https-адрес сайта */
export async function connectTeamBot() {
  const t = await team(true);
  if (!t.botToken) throw new TeamBotError("no_token");
  const me = await call<{ username: string }>(t.botToken, "getMe", {});
  if (!me.ok || !me.result) throw new TeamBotError("bad_token");
  if (!base().startsWith("https://")) throw new TeamBotError("no_https");
  const hook = await call(t.botToken, "setWebhook", { url: `${base()}/api/telegram/team`, secret_token: teamWebhookSecret(), allowed_updates: ["message"] });
  if (!hook.ok) throw new TeamBotError("webhook_failed");
  await call(t.botToken, "setMyCommands", {
    commands: [
      { command: "status", description: "Сводка: что ждёт вас, что в работе" },
      { command: "help", description: "Как ставить задачи" },
    ],
  });
  await saveTeam({ botUsername: me.result.username });
  return { username: me.result.username };
}

/** Состояние подключения для страницы «Ключи»: имя бота, вебхук, ошибка последней доставки */
export async function teamBotStatus() {
  const t = await team(true);
  if (!t.botToken) return { token: false, username: t.botUsername, webhook: null as string | null, lastError: null as string | null, members: t.members };
  const info = await call<{ url: string; last_error_message?: string }>(t.botToken, "getWebhookInfo", {});
  return { token: true, username: t.botUsername, webhook: info.result?.url || null, lastError: info.result?.last_error_message ?? null, members: t.members };
}

/** Ссылка привязки: человек команды открывает её в Telegram и жмёт «Start» — бот запоминает его как своего */
export async function startLink() {
  const t = await team(true);
  if (!t.botToken || !t.botUsername) throw new TeamBotError("not_connected");
  const code = crypto.randomBytes(9).toString("base64url");
  await saveTeam({ linkCode: code, linkCodeAt: new Date().toISOString() });
  return { url: `https://t.me/${t.botUsername}?start=${code}`, expiresInMin: LINK_TTL_MS / 60_000 };
}

export async function removeMember(telegramId: number) {
  const t = await team();
  await saveTeam({ members: t.members.filter((m) => m.telegramId !== telegramId) });
}

/** Сообщение всем привязанным людям команды. Бот не подключён — молча ничего */
export async function notifyMembers(text: string) {
  const t = await team();
  if (!t.botToken || !t.members.length) return;
  await Promise.all(t.members.map((m) => call(t.botToken, "sendMessage", { chat_id: m.telegramId, text, parse_mode: "HTML", disable_web_page_preview: true })));
}

async function statusText() {
  const [c, cfg] = await Promise.all([ccCounts(), getWorkersConfig()]);
  const n = (s: string) => c.byStatus[s] ?? 0;
  return [
    "<b>iHelp · статус</b>",
    `⚡ Нужен ты: ${c.you}${c.approvals ? ` · на приёмке: ${c.approvals}` : ""}`,
    `📥 Бэклог: ${n("backlog")} · в очереди: ${n("ready")}`,
    `🛠 В работе: ${n("in_progress")} · 🚀 на проверке: ${n("review")}`,
    `🤖 Воркеры: ${cfg.enabled ? `включены, работают ${c.running}` : "выключены"}`,
    `${base()}/ru/admin/control`,
  ].join("\n");
}

const HELP = [
  "<b>Как ставить задачи</b>",
  "Напишите сюда, что нужно сделать и зачем, — можно с фото или скриншотом. Появится карточка IN-N, её разберёт триаж: перепишет в задачу или задаст вопрос, вопрос придёт сюда же.",
  "/status — что ждёт вас и что в работе.",
  "Голосовые пока не разбираю: продиктуйте текстом через микрофон клавиатуры.",
].join("\n\n");

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string };
type TgPhoto = { file_id: string; file_size?: number; width: number; height: number };
type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  photo?: TgPhoto[];
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  voice?: unknown;
  audio?: unknown;
  video_note?: unknown;
  date: number;
};
export type TgUpdate = { update_id: number; message?: TgMessage };

const nameOf = (u: TgUser) => [u.first_name, u.last_name].filter(Boolean).join(" ") || (u.username ? `@${u.username}` : String(u.id));

const FILE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/** Скачать файл из Telegram и приложить к карточке. Не вышло — не беда: задача уже заведена */
async function attachFromTelegram(token: string, fileId: string, taskKey: string, fileName: string, mime: string, author: string) {
  const ext = FILE_TYPES[mime];
  if (!ext) return false;
  const info = await call<{ file_path: string; file_size?: number }>(token, "getFile", { file_id: fileId });
  if (!info.ok || !info.result?.file_path || (info.result.file_size ?? 0) > 20 * 1024 * 1024) return false;
  const r = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!r?.ok) return false;
  const buf = Buffer.from(await r.arrayBuffer());
  const dir = path.resolve(process.env.UPLOAD_DIR || "./data/uploads");
  const month = new Date().toISOString().slice(0, 7);
  await fs.mkdir(path.join(dir, month), { recursive: true });
  const name = `${crypto.randomBytes(8).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(dir, month, name), buf);
  await addAttachment({ taskKey }, { fileName: fileName.slice(0, 200), url: `/uploads/${month}/${name}`, size: buf.length, mime }, author);
  return true;
}

/** Обработка входящего сообщения бота команды. Никогда не бросает — вебхук всегда отвечает Telegram 200 */
export async function handleTeamUpdate(update: TgUpdate) {
  const msg = update.message;
  if (!msg?.from || msg.chat.type !== "private") return;
  const t = await team();
  if (!t.botToken) return;
  const from = msg.from;
  const text = (msg.text ?? msg.caption ?? "").trim();
  const member = t.members.find((m) => m.telegramId === from.id);

  const start = /^\/start(?:\s+(\S+))?/.exec(text);
  if (start) {
    const code = start[1];
    if (code && t.linkCode && code === t.linkCode && Date.now() - Date.parse(t.linkCodeAt) < LINK_TTL_MS) {
      if (!member) {
        await saveTeam({ members: [...t.members, { telegramId: from.id, name: nameOf(from), addedAt: new Date().toISOString(), addedBy: "ссылка привязки" }], linkCode: "", linkCodeAt: "" });
      } else await saveTeam({ linkCode: "", linkCodeAt: "" });
      console.log(`[team-bot] привязан ${nameOf(from)}`);
      await reply(msg.chat.id, `✓ Готово, ${html`${nameOf(from)}`}: бот привязан к iHelp.\n\n${HELP}`);
      return;
    }
    if (!member) {
      await reply(msg.chat.id, "Это рабочий бот команды iHelp. Привязать его можно ссылкой из Control Center → «Ключи».");
      return;
    }
  }
  // Чужим — одна короткая фраза и больше ничего: задачи от них не заводятся
  if (!member) {
    await reply(msg.chat.id, "Это рабочий бот команды iHelp.");
    return;
  }
  if (start || /^\/help\b|^помощь$/i.test(text)) {
    await reply(msg.chat.id, HELP);
    return;
  }
  if (/^\/status\b|^статус\.?$/i.test(text)) {
    await reply(msg.chat.id, await statusText());
    return;
  }
  if (msg.voice || msg.audio || msg.video_note) {
    await reply(msg.chat.id, "Голосовые пока не разбираю — продиктуйте текстом через микрофон клавиатуры.");
    return;
  }
  const body = text.replace(/^\/(task|задача)(@\w+)?\s*/i, "").trim();
  const hasFile = !!(msg.photo?.length || msg.document);
  if (body.length < 10 && !hasFile) {
    await reply(msg.chat.id, "Опишите задачу хотя бы парой фраз: что нужно сделать и зачем.");
    return;
  }
  const when = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Yerevan", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(msg.date * 1000));
  const task = await intakeCreate(`${body || "Задача по вложению — смотрите файл."}\n\nИз Telegram: ${member.name}, ${when}.`, `telegram:${member.name}`);
  let attached = false;
  if (msg.photo?.length) {
    const best = msg.photo[msg.photo.length - 1];
    attached = await attachFromTelegram(t.botToken, best.file_id, task.key, `telegram-${msg.message_id}.jpg`, "image/jpeg", member.name).catch(() => false);
  } else if (msg.document) {
    attached = await attachFromTelegram(t.botToken, msg.document.file_id, task.key, msg.document.file_name || `telegram-${msg.message_id}`, msg.document.mime_type || "", member.name).catch(() => false);
  }
  await reply(
    msg.chat.id,
    `✓ <b>${task.key}</b> в очереди триажа${attached ? " (с вложением)" : hasFile ? " (вложение не сохранилось — пришлите PNG, JPG или PDF)" : ""}.\nТриаж разберёт её в ближайшие минуты; вопросы придут сюда.\n${base()}/ru/admin/control?task=${task.key}`,
  );
}
