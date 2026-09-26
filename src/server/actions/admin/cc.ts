"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSection } from "../../admin";
import { audit } from "../../audit";
import { addComment, linkErrorToTask, saveTask, updateTask, type TaskContent } from "../../services/cc";
import { CcError, approveMockup, retriage, returnDesign, transition } from "../../services/ccWork";
import { saveEpic, type EpicContent } from "../../services/epics";
import { deleteAttachment } from "../../services/attachments";
import { EPIC_STATUSES, OWNERS, PRIORITIES, STAGES, STATUSES } from "@/lib/backlog-labels";
import { BLOCKED_ON, type TaskStatusKey } from "@/lib/cc-flow";
import { taskContentSchema } from "@/lib/cc-schema";
import { EVERY_MIN, MODELS, MODES, POOLS, WORKERS_COMMANDS, type Pool } from "@/lib/workers";
import { requestRun, requestStop, saveWorkersConfig, workersControl } from "../../services/workers";
import { intakeCreate } from "../../services/ccBoard";
import { MESSAGE_ROLES, markRead, sendMessage } from "../../services/ccMessages";
import { db } from "../../db";
import { KeyError, checkKey, clearKey, setKey } from "../../services/keys";
import { TeamBotError, connectTeamBot, removeMember, startLink } from "../../services/teamBot";
import { LibraryError, createNote, restoreVersion, setArchived, updateNote } from "../../services/library";
import { LIBRARY_KINDS } from "@/lib/library";
import { formatPhone } from "@/lib/phone";
import type { User } from "@prisma/client";

const who = (u: User) => u.name || formatPhone(u.phone);
const rAll = () => revalidatePath("/", "layout");

const patchSchema = z.object({
  owner: z.enum(Object.keys(OWNERS) as [string, ...string[]]).optional(),
  priority: z.enum(Object.keys(PRIORITIES) as [string, ...string[]]).optional(),
  stage: z.enum(Object.keys(STAGES) as [string, ...string[]]).optional(),
  assignee: z.string().max(60).nullable().optional(),
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

const transitionSchema = z.object({
  to: z.enum(Object.keys(STATUSES) as [string, ...string[]]),
  text: z.string().max(5000).optional(),
  force: z.boolean().optional(),
  blockedOn: z.enum(BLOCKED_ON).optional(),
  sha: z.string().max(40).optional(),
});

/**
 * Смена статуса из админки. Люди с доступом к Control Center действуют с правами владельца,
 * но через те же гейты, что и агенты: обойти гейт можно только явно, с причиной — это видно в истории
 */
export async function ccTransitionAction(key: string, input: z.infer<typeof transitionSchema>) {
  const u = await requireSection("control");
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  try {
    const { to, ...rest } = parsed.data;
    await transition(key, { to: to as TaskStatusKey, ...rest }, { name: who(u), role: "owner", via: "ui" });
    await audit(u.id, "cc.task.status", "Task", key, { to, force: !!rest.force });
    rAll();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof CcError ? e.code : (e as Error).message, detail: e instanceof CcError ? e.detail : undefined };
  }
}

const contentSchema = taskContentSchema;
const lines = z.array(z.string().max(500)).max(20);

/** Создание или изменение задачи в админке. После этого деплой не перезаписывает её тексты */
export async function ccSaveTaskAction(content: unknown, isNew: boolean) {
  const u = await requireSection("control");
  const parsed = contentSchema.safeParse(content);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  try {
    const task = await saveTask(parsed.data as TaskContent, who(u), isNew);
    // Человек поправил карточку — триаж посмотрит её снова
    if (!isNew) await retriage(task.key);
    await audit(u.id, isNew ? "cc.task.create" : "cc.task.edit", "Task", task.key);
    rAll();
    return { ok: true as const, key: task.key };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function ccCommentAction(key: string, text: string) {
  const u = await requireSection("control");
  const t = text.trim();
  if (t.length < 2) return { ok: false as const, error: "empty" };
  await addComment(key, t, who(u));
  // Ответ человека в ленте задачи, ждущей его решения, — сигнал триажу разобрать её снова
  await retriage(key);
  await audit(u.id, "cc.comment", "Task", key);
  rAll();
  return { ok: true as const };
}

/** Утверждение макета задачи владельцем в интерфейсе — снимает гейт mockup_required */
/** «Вернуть дизайнеру»: утверждение снимается, задача блокируется на дизайне с причиной */
export async function ccReturnDesignAction(key: string, reason: string) {
  const u = await requireSection("control");
  try {
    await returnDesign(key, { name: who(u), role: u.role === "OWNER" ? "owner" : "cto", via: "ui" }, reason);
    await audit(u.id, "cc.design.return", "Task", key);
    rAll();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof CcError ? e.code : (e as Error).message };
  }
}

export async function ccApproveMockupAction(key: string, comment: string) {
  const u = await requireSection("control");
  try {
    await approveMockup(key, who(u), comment.trim() || null);
    await audit(u.id, "cc.mockup.approve", "Task", key);
    rAll();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof CcError ? e.code : (e as Error).message };
  }
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

/* ───── Воркеры ───── */

const poolSchema = z
  .object({
    enabled: z.boolean(),
    max: z.number().int().min(0).max(4),
    model: z.enum(MODELS),
    dailyCap: z.number().int().min(0).max(100),
    mode: z.enum(MODES),
    everyMin: z.number().int().refine((n) => (EVERY_MIN as readonly number[]).includes(n)),
  })
  .partial();
const workersSchema = z.object({
  enabled: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  pools: z.object({ triage: poolSchema, dev: poolSchema, tester: poolSchema, deployer: poolSchema }).partial().optional(),
  deployWindow: z.tuple([z.number().int().min(0).max(23), z.number().int().min(1).max(24)]).optional(),
  triageBatch: z.number().int().min(1).max(15).optional(),
  sweepEveryH: z.number().int().min(0).max(168).optional(),
  stopRunning: z.boolean().optional(),
  pausedUntil: z.null().optional(),
});

/** Настройки воркеров из Control Center: выключатель, пробный режим, пулы, окно выкладки, триаж, стоп-кран, снятие паузы */
export async function ccSaveWorkersAction(patch: z.infer<typeof workersSchema>) {
  const u = await requireSection("control");
  const parsed = workersSchema.safeParse(patch);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  await saveWorkersConfig(parsed.data, who(u));
  await audit(u.id, "cc.workers", "Setting", "cc.workers", parsed.data);
  rAll();
  return { ok: true as const };
}

const controlSchema = z.object({ command: z.enum(WORKERS_COMMANDS), at: z.string().datetime({ offset: true }).optional() });

/**
 * Кнопки владельца: Пауза (новые не берутся, текущие доработают), Стоп (плюс остановка текущих),
 * Старт (всё включено в «Авто»), План старт (пауза до времени по Еревану, потом диспетчер запускает сам).
 * Отменить план — «Старт» или «Пауза». Возвращает новые настройки, чтобы пульт обновился без перезагрузки
 */
export async function ccWorkersControlAction(command: string, at?: string) {
  const u = await requireSection("control");
  const parsed = controlSchema.safeParse({ command, at });
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  const when = parsed.data.at ? new Date(parsed.data.at) : null;
  if (parsed.data.command === "plan" && (!when || when.getTime() <= Date.now())) return { ok: false as const, error: "past" };
  const config = await workersControl(parsed.data.command, when, who(u));
  await audit(u.id, `cc.workers.${parsed.data.command}`, "Setting", "cc.workers", { at: when?.toISOString() ?? null });
  rAll();
  return { ok: true as const, config };
}

/** «Запустить сейчас»: пул (и задача) — диспетчер запустит на ближайшем проходе, не дожидаясь очереди и расписания */
export async function ccRunWorkerAction(pool: string, key?: string | null) {
  const u = await requireSection("control");
  if (!(POOLS as readonly string[]).includes(pool)) return { ok: false as const, error: "invalid" };
  const k = key?.trim().toUpperCase() || null;
  if (k && !(await db.task.findUnique({ where: { key: k }, select: { key: true } }))) return { ok: false as const, error: "not_found" };
  await requestRun(pool as Pool, k, who(u));
  await audit(u.id, "cc.workers.run", "Setting", "cc.workers", { pool, key: k });
  rAll();
  return { ok: true as const };
}

export async function ccStopRunAction(runId: string) {
  const u = await requireSection("control");
  const ok = await requestStop(runId, who(u));
  await audit(u.id, "cc.workers.stop", "WorkerRun", runId);
  rAll();
  return ok ? { ok: true as const } : { ok: false as const, error: "not_running" };
}

/* ───── Intake и сообщения ───── */

export async function ccIntakeAction(text: string) {
  const u = await requireSection("control");
  const parsed = z.string().trim().min(10).max(8000).safeParse(text);
  if (!parsed.success) return { ok: false as const, error: "too_short" };
  try {
    const task = await intakeCreate(parsed.data, who(u));
    await audit(u.id, "cc.intake", "Task", task.key);
    rAll();
    return { ok: true as const, key: task.key };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

const messageSchema = z.object({ to: z.enum(MESSAGE_ROLES), text: z.string().trim().min(2).max(4000), taskKey: z.string().max(30).nullable().optional() });

export async function ccSendMessageAction(input: z.infer<typeof messageSchema>) {
  const u = await requireSection("control");
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  await sendMessage({ to: parsed.data.to, from: who(u), text: parsed.data.text, taskKey: parsed.data.taskKey });
  await audit(u.id, "cc.message", "CcMessage", parsed.data.to);
  rAll();
  return { ok: true as const };
}

export async function ccReadMessageAction(id: string) {
  const u = await requireSection("control");
  await markRead(id, who(u));
  rAll();
  return { ok: true as const };
}

/** Сообщение → в бэклог: текст уходит в Intake и дальше в триаж, сообщение отмечается прочитанным */
export async function ccMessageToIntakeAction(id: string) {
  const u = await requireSection("control");
  const msg = await db.ccMessage.findUnique({ where: { id } });
  if (!msg) return { ok: false as const, error: "not_found" };
  const text = `${msg.text}${msg.taskKey ? `\n\nСвязано с ${msg.taskKey}.` : ""}\n\nИз сообщения ${msg.fromAgent}.`;
  const task = await intakeCreate(text.length >= 10 ? text : `Сообщение: ${text}`, who(u));
  await markRead(id, who(u));
  await audit(u.id, "cc.intake", "Task", task.key, { from: "message" });
  rAll();
  return { ok: true as const, key: task.key };
}

/** «Принять все» в Согласованиях: каждая задача закрывается своим переходом через гейт «Сделано» */
export async function ccApproveManyAction(keys: string[]) {
  const u = await requireSection("control");
  const list = z.array(z.string().max(30)).max(50).safeParse(keys);
  if (!list.success) return { ok: false as const, error: "invalid" };
  const done: string[] = [];
  const failed: string[] = [];
  for (const key of list.data) {
    try {
      await transition(key, { to: "done", text: `Принято владельцем в «Согласованиях» (${who(u)}).` }, { name: who(u), role: "owner", via: "ui" });
      done.push(key);
    } catch {
      failed.push(key);
    }
  }
  await audit(u.id, "cc.approve", "Task", done.join(","), { failed });
  rAll();
  return { ok: true as const, done, failed };
}

/** «Вернуть все» в Согласованиях: массовый возврат задач дорожки на доработку с причиной */
export async function ccReturnManyAction(keys: string[], text: string) {
  const u = await requireSection("control");
  const list = z.array(z.string().max(30)).max(50).safeParse(keys);
  const reason = z.string().trim().min(5).max(5000).safeParse(text);
  if (!list.success || !reason.success) return { ok: false as const, error: "invalid" };
  const done: string[] = [];
  const failed: string[] = [];
  for (const key of list.data) {
    try {
      await transition(key, { to: "ready", text: reason.data }, { name: who(u), role: "owner", via: "ui" });
      done.push(key);
    } catch {
      failed.push(key);
    }
  }
  await audit(u.id, "cc.return_many", "Task", done.join(","), { failed });
  rAll();
  return { ok: true as const, done, failed };
}

/** «Отклонить все» в Согласованиях: массовое отклонение задач дорожки с причиной */
export async function ccRejectManyAction(keys: string[], text: string) {
  const u = await requireSection("control");
  const list = z.array(z.string().max(30)).max(50).safeParse(keys);
  const reason = z.string().trim().min(5).max(5000).safeParse(text);
  if (!list.success || !reason.success) return { ok: false as const, error: "invalid" };
  const done: string[] = [];
  const failed: string[] = [];
  for (const key of list.data) {
    try {
      await transition(key, { to: "cancelled", text: reason.data }, { name: who(u), role: "owner", via: "ui" });
      done.push(key);
    } catch {
      failed.push(key);
    }
  }
  await audit(u.id, "cc.reject_many", "Task", done.join(","), { failed });
  rAll();
  return { ok: true as const, done, failed };
}

/* ───── Ключи (как Secrets в LIA) ───── */

const keyPath = z.string().max(80);

/** Задать или заменить ключ. Значение не возвращается и не пишется в журнал */
export async function ccSetKeyAction(path: string, value: string) {
  const u = await requireSection("control");
  const p = keyPath.safeParse(path);
  if (!p.success || typeof value !== "string") return { ok: false as const, error: "invalid" };
  try {
    await setKey(p.data, value, u.id);
    // Новый токен бота команды — сразу подключаем: вебхук и имя бота, чтобы владельцу не делать второй шаг
    if (p.data === "team.botToken") await connectTeamBot().catch(() => null);
    rAll();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof KeyError ? e.message : "error" };
  }
}

export async function ccClearKeyAction(path: string) {
  const u = await requireSection("control");
  const p = keyPath.safeParse(path);
  if (!p.success) return { ok: false as const, error: "invalid" };
  try {
    await clearKey(p.data, u.id);
    rAll();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof KeyError ? e.message : "error" };
  }
}

export async function ccCheckKeyAction(path: string) {
  await requireSection("control");
  const p = keyPath.safeParse(path);
  if (!p.success) return { ok: false as const, error: "invalid" };
  try {
    return { ok: true as const, result: await checkKey(p.data) };
  } catch (e) {
    return { ok: false as const, error: e instanceof KeyError ? e.message : "error" };
  }
}

/* ───── Бот команды ───── */

export async function ccConnectTeamBotAction() {
  const u = await requireSection("control");
  try {
    const r = await connectTeamBot();
    await audit(u.id, "teambot.connect", "Setting", "team", { username: r.username });
    rAll();
    return { ok: true as const, username: r.username };
  } catch (e) {
    return { ok: false as const, error: e instanceof TeamBotError ? e.message : "error" };
  }
}

export async function ccTeamLinkAction() {
  const u = await requireSection("control");
  try {
    const r = await startLink();
    await audit(u.id, "teambot.link", "Setting", "team");
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, error: e instanceof TeamBotError ? e.message : "error" };
  }
}

export async function ccTeamRemoveMemberAction(telegramId: number) {
  const u = await requireSection("control");
  if (!Number.isInteger(telegramId)) return { ok: false as const, error: "invalid" };
  await removeMember(telegramId);
  await audit(u.id, "teambot.remove", "Setting", "team", { telegramId });
  rAll();
  return { ok: true as const };
}

/* ───── Библиотека (как Canon в LIA) ───── */

const noteSchema = z.object({ title: z.string().trim().max(200), kind: z.enum(LIBRARY_KINDS), content: z.string().max(200_000) });

export async function ccLibraryCreateAction(input: z.infer<typeof noteSchema>) {
  const u = await requireSection("control");
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success || !parsed.data.content.trim()) return { ok: false as const, error: "invalid" };
  const doc = await createNote(parsed.data, who(u));
  await audit(u.id, "library.create", "LibraryDoc", doc.slug);
  rAll();
  return { ok: true as const, slug: doc.slug };
}

export async function ccLibraryUpdateAction(slug: string, input: { title: string; content: string; note?: string }) {
  const u = await requireSection("control");
  const parsed = z.object({ title: z.string().trim().max(200), content: z.string().max(200_000), note: z.string().max(300).optional() }).safeParse(input);
  if (!parsed.success || !parsed.data.content.trim()) return { ok: false as const, error: "invalid" };
  try {
    const r = await updateNote(slug, parsed.data, who(u));
    if (r.changed) await audit(u.id, "library.update", "LibraryDoc", slug);
    rAll();
    return { ok: true as const, changed: r.changed };
  } catch (e) {
    return { ok: false as const, error: e instanceof LibraryError ? e.message : "error" };
  }
}

export async function ccLibraryRestoreAction(slug: string, n: number) {
  const u = await requireSection("control");
  if (!Number.isInteger(n) || n < 1) return { ok: false as const, error: "invalid" };
  try {
    await restoreVersion(slug, n, who(u));
    await audit(u.id, "library.restore", "LibraryDoc", slug, { n });
    rAll();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof LibraryError ? e.message : "error" };
  }
}

export async function ccLibraryArchiveAction(slug: string, archived: boolean) {
  const u = await requireSection("control");
  try {
    await setArchived(slug, archived);
    await audit(u.id, archived ? "library.archive" : "library.unarchive", "LibraryDoc", slug);
    rAll();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof LibraryError ? e.message : "error" };
  }
}

/* ───── Журнал ошибок ───── */

/** Создать задачу-баг из записи журнала ошибок */
export async function ccCreateBugFromErrorAction(errorId: string) {
  const u = await requireSection("control");
  const err = await db.appError.findUnique({ where: { id: errorId } });
  if (!err) return { ok: false as const, error: "not_found" };
  if (err.taskKey) return { ok: false as const, error: "already_exists", taskKey: err.taskKey };

  // Генерируем ключ BUG-N
  const existing = await db.task.findMany({ where: { key: { startsWith: "BUG-" } }, select: { key: true } });
  const nums = existing.map((t) => parseInt(t.key.replace("BUG-", ""), 10)).filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  const key = `BUG-${next}`;

  const title = `Ошибка: ${err.source.length > 80 ? err.source.slice(0, 80) + "…" : err.source}`;
  const summary = err.message.slice(0, 500);
  const details = [
    `**Источник:** ${err.source}`,
    `**Первый раз:** ${err.firstSeenAt.toISOString()}`,
    `**Последний раз:** ${err.lastSeenAt.toISOString()}`,
    `**Повторений:** ${err.count}`,
    `**Запись журнала:** ${err.id}`,
    "",
    "```",
    err.message.slice(0, 1000),
    "```",
  ].join("\n");

  await saveTask(
    {
      key,
      title,
      summary,
      details,
      requirements: [`Исправить ошибку: ${err.source}`],
      area: "dev",
      layer: "fullstack",
      priority: "p1",
      stage: "public",
      owner: "tech",
      needs: [],
      depends: [],
      docs: [],
    },
    who(u),
    true,
    "ui",
  );
  await linkErrorToTask(errorId, key);
  await audit(u.id, "error.bug_created", "AppError", errorId, { key });
  rAll();
  return { ok: true as const, taskKey: key };
}

