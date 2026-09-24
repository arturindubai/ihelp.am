import "server-only";
import { db } from "../db";
import { alertTech } from "../alerts";
import { html } from "../notify";

/**
 * Сообщения Control Center (вкладка «Сообщения», как Notify в LIA). Владелец пишет роли или всем воркерам —
 * воркер получит непрочитанное в брифинге при запуске. Воркеры пишут владельцу: вопросы, отчёты триажа.
 */

export const MESSAGE_ROLES = ["owner", "cto", "workers", "triage", "dev", "tester", "deployer"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export async function sendMessage(m: { to: string; from: string; text: string; taskKey?: string | null }) {
  if (!(MESSAGE_ROLES as readonly string[]).includes(m.to)) throw new Error("bad_role");
  const text = m.text.trim().slice(0, 4000);
  if (text.length < 2) throw new Error("empty");
  const msg = await db.ccMessage.create({ data: { toRole: m.to, fromAgent: m.from.slice(0, 60), text, taskKey: m.taskKey?.trim().toUpperCase() || null } });
  // Владельцу — сразу в тех-чат, чтобы вопрос воркера не ждал, пока кто-то откроет админку
  if (m.to === "owner") {
    await alertTech(`cc:msg:${msg.id}`, html`✉️ <b>${m.from}</b>${m.taskKey ? ` · ${m.taskKey}` : ""}\n${text.slice(0, 600)}`, 1).catch(() => null);
  }
  return msg;
}

/** Воркеру: непрочитанное его роли и общее «всем воркерам». Отмечается прочитанным этим воркером */
export async function takeInbox(role: string, reader: string) {
  const roles = role === "owner" || role === "cto" ? [role] : [role, "workers"];
  const unread = await db.ccMessage.findMany({ where: { toRole: { in: roles }, readAt: null }, orderBy: { createdAt: "asc" }, take: 20 });
  if (unread.length) await db.ccMessage.updateMany({ where: { id: { in: unread.map((m) => m.id) } }, data: { readAt: new Date(), readBy: reader.slice(0, 60) } });
  return unread;
}

export async function listMessages(take = 80) {
  return db.ccMessage.findMany({ orderBy: { createdAt: "desc" }, take });
}

export async function markRead(id: string, by: string) {
  await db.ccMessage.updateMany({ where: { id, readAt: null }, data: { readAt: new Date(), readBy: by.slice(0, 60) } });
}

export async function unreadForOwner() {
  return db.ccMessage.count({ where: { toRole: "owner", readAt: null } });
}
