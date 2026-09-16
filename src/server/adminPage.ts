import "server-only";
import { getCurrentUser } from "./auth";
import { sectionsFor, type Section } from "./admin";

/** Для страниц админки: пользователь с доступом к разделу или null */
export async function pageUser(section: Section) {
  const u = await getCurrentUser();
  if (!u || !sectionsFor(u.role).includes(section)) return null;
  return u;
}
