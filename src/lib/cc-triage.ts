/**
 * Вспомогательные функции триажа и тестирования: отличить человека от агента,
 * найти блокирующую ошибку. Чистые функции без доступа к базе.
 */
import { ROLES } from "./cc-flow";

/**
 * Является ли автор записи агентом (воркером)?
 * Имена агентов начинаются с зарегистрированной роли: "triage", "triage-1", "dev-1", "cto".
 * Имена людей из UI — отображаемые имена или номера телефонов, не совпадающие с ролями.
 */
export function isAgentAuthor(author: string): boolean {
  const head = author.trim().toLowerCase().split(/[-_.:\s]/)[0];
  return (ROLES as readonly string[]).includes(head);
}

export type ErrorComment = { kind: string; createdAt: Date; text: string };

/**
 * Есть ли в ленте запись об ошибке (kind="error") новее момента последней сдачи на проверку?
 * Если да — тестировщик получает отказ с текстом этой записи.
 */
export function findBlockingError(comments: ErrorComment[], lastReviewAt: Date): ErrorComment | null {
  return comments.find((c) => c.kind === "error" && c.createdAt > lastReviewAt) ?? null;
}
