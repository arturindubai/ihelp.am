"use server";

import { headers } from "next/headers";
import { db } from "@/server/db";
import { isValidContact } from "@/lib/contactValidation";
import { normalizeEmail } from "@/lib/email";
import { normalizePhone } from "@/lib/phone";

const MAX_CONTACT_LEN = 100;
const IP_HOURLY_LIMIT = 20;

export async function submitServiceInterest(
  serviceSlug: string,
  contact: string,
): Promise<"ok" | "already" | "invalid" | "too_many"> {
  const trimmed = contact.trim();
  if (!trimmed || trimmed.length > MAX_CONTACT_LEN || !isValidContact(trimmed)) return "invalid";

  // нормализация: email → нижний регистр; телефон → E.164
  const normalizedEmail = normalizeEmail(trimmed);
  const normalizedPhone = normalizedEmail ? null : normalizePhone(trimmed);
  const normalizedContact = normalizedEmail ?? normalizedPhone ?? trimmed.toLowerCase();

  // slug должен существовать и иметь признак comingSoon
  const category = await db.category.findUnique({ where: { slug: serviceSlug }, select: { comingSoon: true } });
  if (!category?.comingSoon) return "invalid";

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;

  // ограничение частоты: не более 20 заявок с одного IP за час
  if (ip) {
    const count = await db.serviceInterest.count({
      where: { ip, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
    });
    if (count >= IP_HOURLY_LIMIT) return "too_many";
  }

  try {
    await db.serviceInterest.create({
      data: { serviceSlug, contact: normalizedContact, ip: ip ?? null },
    });
    return "ok";
  } catch (e: unknown) {
    // уникальный индекс: тот же контакт уже оставлял заявку на эту услугу
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return "already";
    }
    throw e;
  }
}
