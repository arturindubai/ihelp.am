/** Роли, считающиеся персоналом — срок их сессии короче клиентских */
const STAFF = new Set(["OPERATOR", "ADMIN", "OWNER"]);

/**
 * Выбирает срок сессии в днях по роли пользователя.
 * Персонал (OPERATOR/ADMIN/OWNER) получает staffDays, остальные — clientDays.
 */
export function sessionDays(role: string | undefined, staffDays: number, clientDays: number): number {
  return role && STAFF.has(role) ? staffDays : clientDays;
}
