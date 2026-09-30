import "server-only";
import { db } from "@/server/db";

/** Адреса пользователя для экрана оформления заказа (сортировка: сначала дефолтный) */
export async function getBookingAddresses(userId: string) {
  return db.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
}

/** Данные заказа для страницы «Успешное оформление» */
export async function getOrderForSuccess(orderId: string, userId: string) {
  return db.order.findFirst({
    where: { id: orderId, userId },
    include: {
      service: true,
      visits: { where: { index: 1 }, include: { master: true }, take: 1 },
    },
  });
}

/** Публичный профиль мастера по slug */
export async function getMasterPublicProfile(slug: string) {
  return db.master.findFirst({
    where: { slug, active: true },
    include: {
      skills: { where: { active: true } },
      reviews: {
        where: { status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { service: true },
      },
    },
  });
}

/** Активная статическая страница по slug */
export async function getStaticPage(slug: string) {
  return db.page.findFirst({ where: { slug, active: true } });
}

/** Данные токена отзыва для страницы оставления отзыва */
export async function getReviewToken(token: string) {
  return db.reviewToken.findUnique({
    where: { token },
    select: {
      usedAt: true,
      expiresAt: true,
      visit: {
        select: {
          id: true,
          status: true,
          review: { select: { id: true } },
          master: { select: { name: true } },
        },
      },
    },
  });
}

/** Данные для sitemap: активные услуги и мастера */
export async function getSitemapEntries() {
  return Promise.all([
    db.service.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }),
    db.master.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }),
  ]);
}
