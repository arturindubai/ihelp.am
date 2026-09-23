"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSection } from "../../admin";
import { audit } from "../../audit";
import { addComment, deleteTask, saveTask, updateTask, type TaskContent } from "../../services/cc";
import { saveEpic, deleteEpic, type EpicContent } from "../../services/epics";
import { deleteAttachment } from "../../services/attachments";
import { AREAS, EPIC_STATUSES, LAYERS, OWNERS, PRIORITIES, STAGES, STATUSES } from "@/lib/backlog-labels";
import { formatPhone } from "@/lib/phone";
import type { User } from "@prisma/client";

const who = (u: User) => u.name || formatPhone(u.phone);
const rAll = () => revalidatePath("/", "layout");

const patchSchema = z.object({
  status: z.enum(Object.keys(STATUSES) as [string, ...string[]]).optional(),
  owner: z.enum(Object.keys(OWNERS) as [string, ...string[]]).optional(),
  priority: z.enum(Object.keys(PRIORITIES) as [string, ...string[]]).optional(),
  stage: z.enum(Object.keys(STAGES) as [string, ...string[]]).optional(),
  assignee: z.string().max(60).nullable().optional(),
  blockedReason: z.string().max(200).nullable().optional(),
});

export async function ccUpdateTaskAction(key: string, patch: z.infer<typeof patchSchema>) {
  const u = await requireSection("control");
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  const data = Object.fromEntries(Object.entries(parsed.data).map(([k, v]) => [k, typeof v === "string" && !v.trim() ? null : v]));
  await updateTask(key, data, who(u));
  await audit(u.id, "cc.task", "Task", key, data);
  rAll();
  return { ok: true as const };
}

const lines = z.array(z.string().max(500)).max(20);
const contentSchema = z.object({
  key: z.string().min(3).max(30),
  title: z.string().min(5).max(200),
  summary: z.string().min(10).max(2000),
  details: z.string().max(5000).nullable().optional(),
  requirements: lines,
  design: z.string().max(5000).nullable().optional(),
  qaNotes: z.string().max(5000).nullable().optional(),
  deployNotes: z.string().max(5000).nullable().optional(),
  needs: lines,
  depends: z.array(z.string().max(30)).max(20),
  docs: lines,
  epicKey: z.string().max(60).nullable().optional(),
  area: z.enum(Object.keys(AREAS) as [string, ...string[]]),
  layer: z.enum(Object.keys(LAYERS) as [string, ...string[]]),
  priority: z.enum(Object.keys(PRIORITIES) as [string, ...string[]]),
  stage: z.enum(Object.keys(STAGES) as [string, ...string[]]),
  owner: z.enum(Object.keys(OWNERS) as [string, ...string[]]),
  estimate: z.enum(["S", "M", "L"]).nullable().optional(),
});

/** Создание или изменение задачи в админке. После этого деплой не перезаписывает её тексты */
export async function ccSaveTaskAction(content: unknown, isNew: boolean) {
  const u = await requireSection("control");
  const parsed = contentSchema.safeParse(content);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  try {
    const task = await saveTask(parsed.data as TaskContent, who(u), isNew);
    await audit(u.id, isNew ? "cc.task.create" : "cc.task.edit", "Task", task.key);
    rAll();
    return { ok: true as const, key: task.key };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function ccDeleteTaskAction(key: string) {
  const u = await requireSection("control");
  try {
    await deleteTask(key, who(u));
    await audit(u.id, "cc.task.delete", "Task", key);
    rAll();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function ccCommentAction(key: string, text: string) {
  const u = await requireSection("control");
  const t = text.trim();
  if (t.length < 2) return { ok: false as const, error: "empty" };
  await addComment(key, t, who(u));
  await audit(u.id, "cc.comment", "Task", key);
  rAll();
  return { ok: true as const };
}

/* ───── Эпики ───── */

const epicContentSchema = z.object({
  key: z.string().min(3).max(60),
  title: z.string().min(3).max(200),
  summary: z.string().min(10).max(2000),
  requirements: lines,
  design: z.string().max(5000).nullable().optional(),
  techNotes: z.string().max(5000).nullable().optional(),
  testingNotes: z.string().max(5000).nullable().optional(),
  deployNotes: z.string().max(5000).nullable().optional(),
  status: z.enum(Object.keys(EPIC_STATUSES) as [string, ...string[]]),
  depends: z.array(z.string().max(60)).max(20),
  docs: lines,
});

export async function ccSaveEpicAction(content: unknown, isNew: boolean) {
  const u = await requireSection("control");
  const parsed = epicContentSchema.safeParse(content);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  try {
    const epic = await saveEpic(parsed.data as EpicContent, who(u), isNew);
    await audit(u.id, isNew ? "cc.epic.create" : "cc.epic.edit", "Epic", epic.key);
    rAll();
    return { ok: true as const, key: epic.key };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function ccDeleteEpicAction(key: string) {
  const u = await requireSection("control");
  try {
    await deleteEpic(key);
    await audit(u.id, "cc.epic.delete", "Epic", key);
    rAll();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function ccDeleteAttachmentAction(id: string) {
  const u = await requireSection("control");
  try {
    await deleteAttachment(id);
    await audit(u.id, "cc.attachment.delete", "Attachment", id);
    rAll();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
