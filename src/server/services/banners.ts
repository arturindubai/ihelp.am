import "server-only";
import { db } from "../db";
import { selectBanners, type BannerPlacement } from "@/lib/banner-select";
import { tr } from "@/i18n/locales";

type BannerRow = {
  id: string;
  title: unknown;
  subtitle: unknown;
  image: string | null;
  link: string | null;
  bg: string | null;
  promoCode: string | null;
  placement: string;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  audience: string;
  segment: string;
  sort: number;
};

export type SlotBanner = {
  id: string;
  title: unknown;
  subtitle: unknown;
  image: string | null;
  link: string | null;
  bg: string | null;
  promoCode: string | null;
};

/** Возвращает первый подходящий баннер для слота или null; инкрементирует показ (кроме EMAIL) */
export async function getBannerForSlot(
  placement: BannerPlacement,
  userId: string | null | undefined,
): Promise<SlotBanner | null> {
  const rows = await db.banner.findMany({
    where: { placement },
    orderBy: { sort: "asc" },
    select: { id: true, title: true, subtitle: true, image: true, link: true, bg: true, promoCode: true, placement: true, active: true, startsAt: true, endsAt: true, audience: true, segment: true, sort: true },
  });

  const isLoggedIn = !!userId;
  let isNew = false;
  if (isLoggedIn && userId) {
    // новый клиент — у которого нет завершённых заказов
    const count = await db.order.count({ where: { userId, status: "COMPLETED" } });
    isNew = count === 0;
  }

  const matching = selectBanners(rows as BannerRow[], {
    placement,
    isLoggedIn,
    isNew,
    now: new Date(),
  });

  if (matching.length === 0) return null;
  const banner = matching[0];
  // один показ на загрузку страницы — EMAIL не считаем (нет сигнала об открытии)
  if (placement !== "EMAIL") {
    await db.banner.update({ where: { id: banner.id }, data: { views: { increment: 1 } } });
  }
  return banner;
}

/** Инкрементирует кол-во кликов по баннеру */
export async function incrementBannerClick(id: string): Promise<void> {
  await db.banner.update({ where: { id }, data: { clicks: { increment: 1 } } });
}

/** Возвращает HTML-блок email-баннера для вставки в письма (locale — язык пользователя) */
export async function getEmailBannerHtml(locale: string): Promise<string | null> {
  const banner = await getBannerForSlot("EMAIL", null);
  if (!banner) return null;
  const title = tr(banner.title, locale) || "";
  if (!title) return null;
  const subtitle = tr(banner.subtitle, locale);
  const bg = banner.bg || "#1c1917";
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const subtitleHtml = subtitle
    ? `<p style="margin:4px 0 0;font-size:13px;opacity:.8;color:#fff">${esc(subtitle)}</p>`
    : "";
  const buttonHtml = banner.link
    ? `<p style="margin:12px 0 0"><a href="${esc(banner.link)}" style="display:inline-block;background:#fff;color:${esc(bg)};text-decoration:none;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px">${banner.promoCode ? esc(banner.promoCode) : esc(title)}</a></p>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="background:${esc(bg)};border-radius:12px;padding:16px 20px"><p style="margin:0;font-size:15px;font-weight:700;color:#fff">${esc(title)}</p>${subtitleHtml}${buttonHtml}</td></tr></table>`;
}
