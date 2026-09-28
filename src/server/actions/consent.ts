"use server";
import { revalidatePath } from "next/cache";
import { db } from "../db";
import { getCurrentUser } from "../auth";

/** Установить или отозвать согласие на рекламные рассылки (LEGAL-2) */
export async function toggleAdsConsentAction(enabled: boolean) {
  const u = await getCurrentUser();
  if (!u) return { ok: false as const };
  await db.user.update({
    where: { id: u.id },
    data: { adsConsentAt: enabled ? new Date() : null },
  });
  revalidatePath("/", "layout");
  return { ok: true as const };
}
