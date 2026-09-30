"use server";

import { headers } from "next/headers";
import { db } from "@/server/db";
import { isValidContact } from "@/lib/contactValidation";
import { normalizeEmail } from "@/lib/email";
import { normalizePhone } from "@/lib/phone";

const MAX_CONTACT_LEN = 100;
const IP_HOURLY_LIMIT = 20;

export async function submitServiceInterest(
  slug: string,
  contact: string,
): Promise<"ok" | "already" | "invalid" | "too_many"> {
  const trimmed = contact.trim();
  if (!trimmed || trimmed.length > MAX_CONTACT_LEN || !isValidContact(trimmed)) return "invalid";

  // нормализация: email → нижний регистр; телефон → E.164
  const normalizedEmail = normalizeEmail(trimmed);
  const normalizedPhone = normalizedEmail ? null : normalizePhone(trimmed);
  const normalizedContact = normalizedEmail ?? normalizedPhone ?? trimmed.toLowerCase();

  // slug должен быть comingSoon-категорией или comingSoon-услугой
  const [category, service] = await Promise.all([
    db.category.findUnique({ where: { slug }, select: { comingSoon: true } }),
    db.service.findUnique({ where: { slug }, select: { comingSoon: true } }),
  ]);

  const isCategory = category?.comingSoon === true;
  const isService = service?.comingSoon === true;
  if (!isCategory && !isService) return "invalid";

  const kind = isService ? "service" : "category";

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
      data: { serviceSlug: slug, contact: normalizedContact, ip: ip ?? null, kind },
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
