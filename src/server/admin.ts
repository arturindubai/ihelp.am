import "server-only";
import { getCurrentUser } from "./auth";
import { sectionsForUser, type Section } from "@/lib/adminAccess";

export type { Section } from "@/lib/adminAccess";
export { sectionsFor, sectionsForUser, DELEGATABLE_SECTIONS } from "@/lib/adminAccess";

export async function requireSection(section: Section) {
  const u = await getCurrentUser();
  if (!u || !sectionsForUser(u).includes(section)) throw new Error("forbidden");
  return u;
}
