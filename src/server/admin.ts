import "server-only";
import type { Role } from "@prisma/client";
import { getCurrentUser } from "./auth";

export type Section = "control" | "dashboard" | "orders" | "schedule" | "clients" | "reviews" | "services" | "masters" | "promos" | "banners" | "pages" | "translations" | "settings" | "staff" | "log";

const ACCESS: Record<Role, Section[]> = {
  CLIENT: [],
  MASTER: [],
  OPERATOR: ["dashboard", "orders", "schedule", "clients", "reviews"],
  ADMIN: ["control", "dashboard", "orders", "schedule", "clients", "reviews", "services", "masters", "promos", "banners", "pages", "translations", "log"],
  OWNER: ["control", "dashboard", "orders", "schedule", "clients", "reviews", "services", "masters", "promos", "banners", "pages", "translations", "settings", "staff", "log"],
};

export function sectionsFor(role: Role) {
  return ACCESS[role] || [];
}

export async function requireSection(section: Section) {
  const u = await getCurrentUser();
  if (!u || !sectionsFor(u.role).includes(section)) throw new Error("forbidden");
  return u;
}
