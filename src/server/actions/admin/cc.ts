"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSection } from "../../admin";
import { audit } from "../../audit";
import { addComment, updateTask } from "../../services/cc";
import { OWNERS, PRIORITIES, STAGES, STATUSES } from "@/lib/backlog-labels";
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

export async function ccCommentAction(key: string, text: string) {
  const u = await requireSection("control");
  const t = text.trim();
  if (t.length < 2) return { ok: false as const, error: "empty" };
  await addComment(key, t, who(u));
  await audit(u.id, "cc.comment", "Task", key);
  rAll();
  return { ok: true as const };
}
