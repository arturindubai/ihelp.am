import "server-only";
import { db } from "../db";
import { html, notifyTech } from "../notify";
import { transition, reblockOn } from "./ccWork";
import { maskSecrets } from "@/lib/secrets-mask";

/**
 * Сообщения Control Center (вкладка «Сообщения», как Notify в LIA). Владелец пишет роли или всем воркерам —
 * воркер получит непрочитанное в брифинге при запуске. Воркеры пишут владельцу только уведомления;
 * вопросы задаются блокировкой задачи на владельце (block --on owner), не сообщением.
 */

export const MESSAGE_ROLES = ["owner", "cto", "workers", "triage", "product", "designer", "dev", "nocode", "tester", "deployer"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export async function sendMessage(m: { to: string; from: string; text: string; taskKey?: string | null }) {
  if (!(MESSAGE_ROLES as readonly string[]).includes(m.to)) throw new Error("bad_role");
  const { masked: safeText, found: hadSecret } = maskSecrets(m.text.trim().slice(0, 4000));
  const text = safeText;
  if (text.length < 2) throw new Error("empty");
  const msg = await db.ccMessage.create({ data: { toRole: m.to, fromAgent: m.from.slice(0, 60), text, taskKey: m.taskKey?.trim().toUpperCase() || null } });
  // Владельцу — сразу в тех-чат
  if (m.to === "owner") {
    await notifyTech(html`✉️ <b>${m.from}</b>${m.taskKey ? ` · ${m.taskKey}` : ""}\n${text.slice(0, 1500)}`).catch(() => null);
  }
  return { msg, masked: hadSecret };
}

/** Воркеру: непрочитанное его роли и общее «всем воркерам». Отмечается прочитанным этим воркером */
export async function takeInbox(role: string, reader: string) {
  const roles = role === "owner" || role === "cto" ? [role] : [role, "workers"];
  const unread = await db.ccMessage.findMany({ where: { toRole: { in: roles }, readAt: null }, orderBy: { createdAt: "asc" }, take: 20 });
  if (unread.length) await db.ccMessage.updateMany({ where: { id: { in: unread.map((m) => m.id) } }, data: { readAt: new Date(), readBy: reader.slice(0, 60) } });
  return unread;
}

/** Набор ключей задач, заблокированных на владельце или продукте */
async function blockedOwnerTaskKeys(taskKeys: string[]): Promise<Set<string>> {
  if (!taskKeys.length) return new Set();
  const tasks = await db.task.findMany({
    where: { key: { in: taskKeys }, status: "blocked", blockedOn: { in: ["owner", "product"] } },
    select: { key: true },
  });
  return new Set(tasks.map((t) => t.key));
}

/**
 * Список сообщений с флагом isQuestion: true, если сообщение owner-адресату и его задача заблокирована
 * на владельце/продукте (вопрос уже виден в «Нужен ты» — на вкладку «Сообщения» не идёт).
 */
export async function listMessages(take = 80) {
  const msgs = await db.ccMessage.findMany({ orderBy: { createdAt: "desc" }, take });
  const ownerKeys = msgs.filter((m) => m.toRole === "owner" && m.taskKey).map((m) => m.taskKey as string);
  const blocked = await blockedOwnerTaskKeys(ownerKeys);
  return msgs.map((m) => ({ ...m, isQuestion: !!(m.toRole === "owner" && m.taskKey && blocked.has(m.taskKey)) }));
}

/** Входящие владельца: только toRole="owner", отдельным запросом без смешивания с другими ролями */
export async function listOwnerInbox(take = 100) {
  const msgs = await db.ccMessage.findMany({ where: { toRole: "owner" }, orderBy: { createdAt: "desc" }, take });
  const keys = msgs.filter((m) => m.taskKey).map((m) => m.taskKey as string);
  const blocked = await blockedOwnerTaskKeys(keys);
  return msgs.map((m) => ({ ...m, isQuestion: !!(m.taskKey && blocked.has(m.taskKey)) }));
}

export async function markRead(id: string, by: string) {
  await db.ccMessage.updateMany({ where: { id, readAt: null }, data: { readAt: new Date(), readBy: by.slice(0, 60) } });
}

/**
 * Отметить прочитанными все непрочитанные уведомления владельца (не вопросы).
 * Вопросы (taskKey → задача заблокирована на owner/product) не трогаем — их решают в «Нужен ты».
 */
export async function markAllReadForOwner(by: string): Promise<number> {
  const unread = await db.ccMessage.findMany({ where: { toRole: "owner", readAt: null }, select: { id: true, taskKey: true } });
  const blocked = await blockedOwnerTaskKeys(unread.map((m) => m.taskKey).filter(Boolean) as string[]);
  const toMark = unread.filter((m) => !(m.taskKey && blocked.has(m.taskKey)));
  if (toMark.length) {
    await db.ccMessage.updateMany({ where: { id: { in: toMark.map((m) => m.id) } }, data: { readAt: new Date(), readBy: by.slice(0, 60) } });
  }
  return toMark.length;
}

/**
 * Одноразовая чистка: сообщения-вопросы, по которым уже есть открытая карточка в «Нужен ты»,
 * отмечаются прочитанными (убираются из счётчика). Безопасно вызывать повторно — ничего лишнего не трогает.
 */
export async function autoMarkQuestionMessages(by: string): Promise<number> {
  const unread = await db.ccMessage.findMany({ where: { toRole: "owner", readAt: null, taskKey: { not: null } }, select: { id: true, taskKey: true } });
  if (!unread.length) return 0;
  const blocked = await blockedOwnerTaskKeys(unread.map((m) => m.taskKey as string));
  const toMark = unread.filter((m) => m.taskKey && blocked.has(m.taskKey));
  // Каждое сообщение отмечается отдельно — чтобы readBy содержал ключ задачи (ссылка на карточку)
  for (const m of toMark) {
    await db.ccMessage.updateMany({
      where: { id: m.id, readAt: null },
      data: { readAt: new Date(), readBy: `auto:${by}→${m.taskKey}`.slice(0, 60) },
    });
  }
  return toMark.length;
}

/**
 * Одноразовая конвертация «осиротевших» вопросов в карточки «Нужен ты».
 * Признак вопроса — текст содержит «?». Исключаются уже обработанные autoMarkQuestionMessages.
 * Задачи в backlog/ready/in_progress/review с вопросом без карточки → blocked on owner.
 * Задачи уже в blocked (на другом адресате) → адресат меняется на owner.
 * Задачи closed (done/cancelled) или в активной работе (in_progress/review) → просто прочитано.
 */
export async function convertOrphanQuestions(by: string): Promise<number> {
  const unread = await db.ccMessage.findMany({
    where: { toRole: "owner", readAt: null },
    select: { id: true, taskKey: true, text: true, fromAgent: true },
  });
  if (!unread.length) return 0;

  const questions = unread.filter((m) => m.text.includes("?"));
  if (!questions.length) return 0;

  const taskKeys = questions.filter((m) => m.taskKey).map((m) => m.taskKey as string);
  const alreadyBlocked = await blockedOwnerTaskKeys(taskKeys);
  const orphans = questions.filter((m) => !(m.taskKey && alreadyBlocked.has(m.taskKey)));
  if (!orphans.length) return 0;

  let converted = 0;
  for (const msg of orphans) {
    if (!msg.taskKey) {
      await db.ccMessage.updateMany({ where: { id: msg.id, readAt: null }, data: { readAt: new Date(), readBy: "auto:orphan-no-task" } });
      converted++;
      continue;
    }

    const task = await db.task.findUnique({ where: { key: msg.taskKey }, select: { id: true, status: true } });

    if (!task || ["done", "cancelled", "in_progress", "review"].includes(task.status)) {
      // Задача закрыта или в активной работе — вопрос, вероятно, уже снят
      await db.ccMessage.updateMany({ where: { id: msg.id, readAt: null }, data: { readAt: new Date(), readBy: `auto:orphan-${task?.status ?? "unknown"}`.slice(0, 60) } });
      converted++;
      continue;
    }

    const reason = `Вопрос из сообщения ${msg.fromAgent}: ${msg.text.slice(0, 400)}`;
    try {
      if (task.status === "blocked") {
        await reblockOn(msg.taskKey, "owner", reason, { name: `auto:${by}`, role: "owner", via: "api" });
      } else {
        await transition(msg.taskKey, { to: "blocked", blockedOn: "owner", text: reason }, { name: `auto:${by}`, role: "owner", via: "api" });
      }
      await db.ccMessage.updateMany({ where: { id: msg.id, readAt: null }, data: { readAt: new Date(), readBy: `auto:blocked→${msg.taskKey}`.slice(0, 60) } });
      converted++;
    } catch {
      await db.ccMessage.updateMany({ where: { id: msg.id, readAt: null }, data: { readAt: new Date(), readBy: "auto:orphan-err" } });
      converted++;
    }
  }
  return converted;
}

/**
 * При закрытии задачи (done/cancelled) — отмечаем все непрочитанные уведомления владельца
 * по этой задаче как прочитанные автоматически.
 */
export async function markReadForClosedTask(taskKey: string, by: string): Promise<number> {
  const result = await db.ccMessage.updateMany({
    where: { toRole: "owner", readAt: null, taskKey },
    data: { readAt: new Date(), readBy: `auto:closed→${taskKey}`.slice(0, 60) },
  });
  return result.count;
}

/**
 * Счётчик непрочитанных уведомлений владельца. Исключает:
 * — сообщения-вопросы (taskKey → задача заблокирована на owner/product, уже в «Нужен ты»)
 */
export async function unreadForOwner() {
  const unread = await db.ccMessage.findMany({ where: { toRole: "owner", readAt: null }, select: { id: true, taskKey: true } });
  if (!unread.length) return 0;
  const blocked = await blockedOwnerTaskKeys(unread.map((m) => m.taskKey).filter(Boolean) as string[]);
  return unread.filter((m) => !(m.taskKey && blocked.has(m.taskKey))).length;
}
