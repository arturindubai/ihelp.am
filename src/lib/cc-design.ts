/** Утилиты фильтрации задач в блоке «Дизайн» Control Center */

/** Настоящий макет — ссылка (mockupUrl) или картинка во вложениях (imageAttachments уже отфильтрован по mime) */
export function hasMockup(task: { mockupUrl?: string | null; imageAttachments?: unknown[] }): boolean {
  if (task.mockupUrl) return true;
  return (task.imageAttachments ?? []).length > 0;
}

/** Задача попадает в блок «На согласовании»: есть настоящий макет, дизайн не утверждён, задача открыта */
export function isPendingApproval(task: {
  status: string;
  mockupApprovedBy?: string | null;
  mockupUrl?: string | null;
  imageAttachments?: unknown[];
  blockedOn?: string | null;
}): boolean {
  if (task.status === "done" || task.status === "cancelled") return false;
  if (task.mockupApprovedBy) return false;
  // Возвращена дизайнеру и ещё не прислал новый макет — ждёт у дизайнера, не у владельца
  if (task.status === "blocked" && task.blockedOn === "design" && !hasMockup(task)) return false;
  return hasMockup(task);
}

/** Задача попадает в блок «Ждёт макета»: флаг «нужен макет» стоит, реального макета нет */
export function isWaitingMockup(task: {
  status: string;
  mockupApprovedBy?: string | null;
  mockupRequired?: boolean;
  mockupUrl?: string | null;
  imageAttachments?: unknown[];
}): boolean {
  if (task.status === "done" || task.status === "cancelled") return false;
  if (task.mockupApprovedBy) return false;
  if (!task.mockupRequired) return false;
  return !hasMockup(task);
}

/** Что держит дизайн задачи в блоке «Ждёт макета» */
export type MockupHold = "owner" | "product" | "active" | "queue" | "none";

/**
 * inDesignerQueue — задача присутствует в текущей очереди дизайнера (w.queues.designer);
 * без этого флага «очередь дизайнера» не показывается, чтобы не вводить в заблуждение при пустой очереди.
 */
export function mockupHold(
  task: { status: string; blockedOn?: string | null; claimedBy?: string | null },
  inDesignerQueue = false,
): MockupHold {
  if (task.status === "blocked" && task.blockedOn === "owner") return "owner";
  if (task.status === "blocked" && task.blockedOn === "product") return "product";
  if (task.status === "in_progress" && task.claimedBy) return "active";
  return inDesignerQueue ? "queue" : "none";
}
