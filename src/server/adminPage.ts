import "server-only";
import { getCurrentUser } from "./auth";
import { sectionsForUser, type Section } from "@/lib/adminAccess";

/** Для страниц админки: пользователь с доступом к разделу или null */
export async function pageUser(section: Section) {
  const u = await getCurrentUser();
  if (!u || !sectionsForUser(u).includes(section)) return null;
  return u;
}
