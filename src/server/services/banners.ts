import "server-only";
import { db } from "../db";
import { selectBanners, type BannerPlacement } from "@/lib/banner-select";

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

/** Возвращает первый подходящий баннер для слота или null */
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
    const count = await db.order.count({ where: { userId } });
    isNew = count === 0;
  }

  const matching = selectBanners(rows as BannerRow[], {
    placement,
    isLoggedIn,
    isNew,
    now: new Date(),
  });

  return matching.length > 0 ? matching[0] : null;
}
