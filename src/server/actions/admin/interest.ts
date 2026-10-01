"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "../../admin";
import { getSettings, saveSettingsSection } from "../../settings";

/** Сохранить режим уведомлений о новых заявках «Уведомить меня». Требует доступ к разделу «Услуги». */
export async function saveInterestNotifyModeAction(mode: "immediate" | "digest") {
  await requireSection("services");
  if (mode !== "immediate" && mode !== "digest") return { ok: false as const, error: "invalid" };
  const s = await getSettings();
  await saveSettingsSection("notify", { ...s.notify, interestNotifyMode: mode });
  revalidatePath("/", "layout");
  return { ok: true as const };
}
