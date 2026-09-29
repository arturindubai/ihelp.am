/**
 * Вспомогательные функции триажа и тестирования: отличить человека от агента,
 * найти блокирующую ошибку, вычислить базовую точку отсчёта для отметки «разобрано».
 * Чистые функции без доступа к базе.
 */
import { ROLES } from "./cc-flow";

// "owner" — человек, не агент: ответы владельца должны блокировать отметку «разобрано»
const AGENT_ROLES = ROLES.filter((r) => r !== "owner");

/**
 * Является ли автор записи агентом (воркером)?
 * Имена агентов начинаются с зарегистрированной роли: "triage", "triage-1", "dev-1", "cto".
 * "owner" исключён: владелец — человек при любом регистре имени.
 * Имена людей из UI — отображаемые имена или номера телефонов.
 */
export function isAgentAuthor(author: string): boolean {
  const head = author.trim().toLowerCase().split(/[-_.:\s]/)[0];
  return (AGENT_ROLES as readonly string[]).includes(head);
}

/**
 * Базовая точка отсчёта для markTriaged(): наиболее позднее из двух событий —
 * последнего retriage или последнего triaged_refused. Запись человека, сделанная
 * до этой точки, уже учтена — не блокирует следующую попытку отметить «разобрано».
 */
export function baselineFor(retriageAt: Date | null, refusalAt: Date | null): Date | null {
  if (!retriageAt) return refusalAt;
  if (!refusalAt) return retriageAt;
  return retriageAt > refusalAt ? retriageAt : refusalAt;
}

export type ErrorComment = { kind: string; createdAt: Date; text: string };

/**
 * Есть ли в ленте запись об ошибке (kind="error") новее момента последней сдачи на проверку?
 * Если да — тестировщик получает отказ с текстом этой записи.
 */
export function findBlockingError(comments: ErrorComment[], lastReviewAt: Date): ErrorComment | null {
  return comments.find((c) => c.kind === "error" && c.createdAt > lastReviewAt) ?? null;
}
