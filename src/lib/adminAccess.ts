import type { Role } from "@prisma/client";

export type Section = "control" | "dashboard" | "finance" | "orders" | "schedule" | "clients" | "reviews" | "services" | "masters" | "promos" | "banners" | "pages" | "content" | "translations" | "settings" | "staff" | "log" | "analytics";

/** 16 разделов, доступных для тонкой настройки per-person поверх роли. settings и staff — только у OWNER */
export const DELEGATABLE_SECTIONS: Section[] = ["control", "dashboard", "finance", "orders", "schedule", "clients", "reviews", "services", "masters", "promos", "banners", "pages", "content", "translations", "analytics", "log"];

const ACCESS: Record<Role, Section[]> = {
  CLIENT: [],
  MASTER: [],
  OPERATOR: ["dashboard", "orders", "schedule", "clients", "reviews"],
  ADMIN: ["control", "dashboard", "finance", "orders", "schedule", "clients", "reviews", "services", "masters", "promos", "banners", "pages", "content", "translations", "analytics", "log"],
  OWNER: ["control", "dashboard", "finance", "orders", "schedule", "clients", "reviews", "services", "masters", "promos", "banners", "pages", "content", "translations", "analytics", "settings", "staff", "log"],
};

export function sectionsFor(role: Role): Section[] {
  return ACCESS[role] ?? [];
}

type Delta = { added: string[]; removed: string[] };

function parseDelta(raw: unknown): Delta {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { added: [], removed: [] };
  const d = raw as Record<string, unknown>;
  const toStrArr = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
  return { added: toStrArr(d.added), removed: toStrArr(d.removed) };
}

/** Итоговые разделы для конкретного пользователя: роль + per-person дельта */
export function sectionsForUser(user: { role: Role; sectionDelta?: unknown }): Section[] {
  const base = sectionsFor(user.role);
  const delta = parseDelta(user.sectionDelta);
  if (!delta.added.length && !delta.removed.length) return base;
  const addedSet = new Set(
    delta.added.filter((s): s is Section => (DELEGATABLE_SECTIONS as string[]).includes(s) && !base.includes(s as Section)),
  );
  const removedSet = new Set(delta.removed.filter((s): s is Section => (DELEGATABLE_SECTIONS as string[]).includes(s)));
  return [...base.filter((s) => !removedSet.has(s)), ...addedSet];
}
