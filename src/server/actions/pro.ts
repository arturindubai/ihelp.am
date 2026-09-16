"use server";
import { revalidatePath } from "next/cache";
import { db } from "../db";
import { getCurrentUser } from "../auth";
import { setCashCollected, setVisitStatus } from "../services/visits";
import { tr } from "@/i18n/locales";

async function myVisit(visitId: string) {
  const u = await getCurrentUser();
  if (!u) throw new Error("auth");
  const m = await db.master.findUnique({ where: { userId: u.id } });
  if (!m) throw new Error("forbidden");
  const v = await db.visit.findFirst({ where: { id: visitId, masterId: m.id } });
  if (!v) throw new Error("not_found");
  return { m, v };
}

const FLOW: Record<string, string[]> = { SCHEDULED: ["ON_WAY", "IN_PROGRESS"], CONFIRMED: ["ON_WAY", "IN_PROGRESS"], ON_WAY: ["IN_PROGRESS"], IN_PROGRESS: ["DONE"] };

export async function proStatusAction(visitId: string, status: "ON_WAY" | "IN_PROGRESS" | "DONE") {
  const { m, v } = await myVisit(visitId);
  if (!FLOW[v.status]?.includes(status)) return { ok: false };
  await setVisitStatus(v.id, status, `мастер ${tr(m.name, "ru")}`);
  revalidatePath("/[locale]/pro", "page");
  return { ok: true };
}

export async function proCashAction(visitId: string) {
  const { v } = await myVisit(visitId);
  await setCashCollected(v.id, !v.cashCollected);
  revalidatePath("/[locale]/pro", "page");
  return { ok: true };
}

export async function proNoteAction(visitId: string, note: string) {
  const { v } = await myVisit(visitId);
  await db.visit.update({ where: { id: v.id }, data: { masterNote: note.slice(0, 1000) } });
  return { ok: true };
}
