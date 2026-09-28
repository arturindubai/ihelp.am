"use server";

import { db } from "@/server/db";
import { isValidContact } from "@/lib/contactValidation";

export async function submitServiceInterest(
  serviceSlug: string,
  contact: string,
): Promise<"ok" | "already" | "invalid"> {
  const trimmed = contact.trim();
  if (!trimmed || !isValidContact(trimmed)) return "invalid";

  try {
    await db.serviceInterest.create({ data: { serviceSlug, contact: trimmed } });
    return "ok";
  } catch (e: unknown) {
    // уникальный индекс: тот же контакт уже оставлял заявку на эту услугу
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return "already";
    }
    throw e;
  }
}
