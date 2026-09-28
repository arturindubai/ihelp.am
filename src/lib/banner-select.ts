export type BannerPlacement = "CAROUSEL_HOME" | "HERO_HOME" | "CATALOG" | "SERVICE" | "CHECKOUT" | "SUCCESS" | "EMAIL" | "MASTER_CABINET";
export type BannerAudience = "ALL" | "LOGGED_IN" | "GUESTS";
export type BannerSegment = "ALL" | "NEW" | "RETURNING";

export type SelectableBanner = {
  id: string;
  placement: string;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  audience: string;
  segment: string;
  sort: number;
};

export type SelectContext = {
  placement: BannerPlacement;
  isLoggedIn: boolean;
  /** true = у пользователя ещё нет завершённых заказов */
  isNew: boolean;
  now: Date;
};

/** Возвращает баннеры, подходящие для данного места, момента и посетителя; отсортированы по sort */
export function selectBanners<T extends SelectableBanner>(banners: T[], ctx: SelectContext): T[] {
  return banners
    .filter((b) => {
      if (!b.active) return false;
      if (b.placement !== ctx.placement) return false;
      if (b.startsAt && b.startsAt > ctx.now) return false;
      if (b.endsAt && b.endsAt < ctx.now) return false;
      if (b.audience === "LOGGED_IN" && !ctx.isLoggedIn) return false;
      if (b.audience === "GUESTS" && ctx.isLoggedIn) return false;
      if (ctx.isLoggedIn) {
        if (b.segment === "NEW" && !ctx.isNew) return false;
        if (b.segment === "RETURNING" && ctx.isNew) return false;
      }
      return true;
    })
    .sort((a, b) => a.sort - b.sort);
}

/** Вычисляет отображаемый статус баннера для списка в админке */
export function bannerStatus(b: { active: boolean; startsAt: Date | null; endsAt: Date | null }, now: Date): "active" | "paused" | "scheduled" | "expired" {
  if (!b.active) return "paused";
  if (b.startsAt && b.startsAt > now) return "scheduled";
  if (b.endsAt && b.endsAt < now) return "expired";
  return "active";
}
