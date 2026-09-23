import "server-only";
import fs from "fs/promises";
import path from "path";
import { db } from "../db";

export async function addAttachment(subject: { taskKey?: string; epicKey?: string }, file: { fileName: string; url: string; size: number; mime: string }, uploadedBy: string) {
  const taskId = subject.taskKey ? (await db.task.findUnique({ where: { key: subject.taskKey }, select: { id: true } }))?.id : undefined;
  if (subject.taskKey && !taskId) throw new Error("not_found");
  if (subject.epicKey && !(await db.epic.findUnique({ where: { key: subject.epicKey }, select: { key: true } }))) throw new Error("not_found");
  return db.attachment.create({ data: { taskId: taskId ?? null, epicKey: subject.epicKey ?? null, ...file, uploadedBy } });
}

/** Удаляет запись и сам файл с диска. Молчит, если файла уже нет — запись всё равно убирается */
export async function deleteAttachment(id: string) {
  const a = await db.attachment.findUnique({ where: { id } });
  if (!a) throw new Error("not_found");
  await db.attachment.delete({ where: { id } });
  try {
    await fs.unlink(path.resolve((process.env.UPLOAD_DIR || "./data/uploads") + a.url.replace(/^\/uploads/, "")));
  } catch {
    // файла нет или уже удалён — не критично
  }
}
