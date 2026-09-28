import "server-only";
import { randomBytes } from "crypto";
import { db } from "../db";

const REVIEW_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

/** Создать или вернуть действующий одноразовый токен для отзыва по визиту. */
export async function createReviewToken(visitId: string): Promise<string> {
  const existing = await db.reviewToken.findUnique({ where: { visitId } });
  if (existing && !existing.usedAt && existing.expiresAt > new Date()) {
    return existing.token;
  }
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + REVIEW_TOKEN_TTL_MS);
  await db.reviewToken.upsert({
    where: { visitId },
    create: { token, visitId, expiresAt },
    update: { token, usedAt: null, expiresAt },
  });
  return token;
}

/** Валидировать токен отзыва: проверить, что не использован, не истёк, вернуть visitId/userId/orderId.
 *  При успехе помечает токен использованным. */
export async function consumeReviewToken(
  token: string,
): Promise<{ visitId: string; userId: string; orderId: string } | null> {
  const rt = await db.reviewToken.findUnique({
    where: { token },
    select: {
      id: true,
      usedAt: true,
      expiresAt: true,
      visit: { select: { id: true, order: { select: { id: true, userId: true } } } },
    },
  });
  if (!rt) return null;
  if (rt.usedAt) return null;
  if (rt.expiresAt < new Date()) return null;

  await db.reviewToken.update({ where: { id: rt.id }, data: { usedAt: new Date() } });

  return {
    visitId: rt.visit.id,
    userId: rt.visit.order.userId,
    orderId: rt.visit.order.id,
  };
}

/** Получить список клиентских сообщений для карточки заказа в админке. */
export async function getOrderMessages(orderId: string) {
  return db.clientMessage.findMany({
    where: { orderId },
    orderBy: { sentAt: "asc" },
    select: { id: true, visitId: true, event: true, subject: true, channel: true, delivered: true, sentAt: true },
  });
}
