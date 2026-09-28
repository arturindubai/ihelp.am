import { describe, expect, it } from "vitest";
import { selectBanners, bannerStatus, type SelectableBanner, type SelectContext } from "./banner-select";

const now = new Date("2026-09-28T12:00:00Z");
const past = (h: number) => new Date(now.getTime() - h * 3_600_000);
const future = (h: number) => new Date(now.getTime() + h * 3_600_000);

const base: SelectableBanner = {
  id: "1",
  placement: "HERO_HOME",
  active: true,
  startsAt: null,
  endsAt: null,
  audience: "ALL",
  segment: "ALL",
  sort: 0,
};

const ctx: SelectContext = { placement: "HERO_HOME", isLoggedIn: false, isNew: false, now };

describe("selectBanners — место размещения", () => {
  it("пропускает баннер другого места", () => {
    expect(selectBanners([{ ...base, placement: "CATALOG" }], ctx)).toHaveLength(0);
  });

  it("пропускает неактивный баннер", () => {
    expect(selectBanners([{ ...base, active: false }], ctx)).toHaveLength(0);
  });

  it("включает баннер нужного места", () => {
    expect(selectBanners([base], ctx)).toHaveLength(1);
  });
});

describe("selectBanners — срок показа", () => {
  it("баннер ещё не начался — не показывать", () => {
    expect(selectBanners([{ ...base, startsAt: future(1) }], ctx)).toHaveLength(0);
  });

  it("баннер уже закончился — не показывать", () => {
    expect(selectBanners([{ ...base, endsAt: past(1) }], ctx)).toHaveLength(0);
  });

  it("баннер в пределах срока — показывать", () => {
    expect(selectBanners([{ ...base, startsAt: past(2), endsAt: future(2) }], ctx)).toHaveLength(1);
  });

  it("нет дат — показывать всегда", () => {
    expect(selectBanners([base], ctx)).toHaveLength(1);
  });
});

describe("selectBanners — аудитория", () => {
  it("LOGGED_IN — не показывать гостям", () => {
    expect(selectBanners([{ ...base, audience: "LOGGED_IN" }], { ...ctx, isLoggedIn: false })).toHaveLength(0);
  });

  it("LOGGED_IN — показывать вошедшим", () => {
    expect(selectBanners([{ ...base, audience: "LOGGED_IN" }], { ...ctx, isLoggedIn: true })).toHaveLength(1);
  });

  it("GUESTS — не показывать вошедшим", () => {
    expect(selectBanners([{ ...base, audience: "GUESTS" }], { ...ctx, isLoggedIn: true })).toHaveLength(0);
  });

  it("GUESTS — показывать гостям", () => {
    expect(selectBanners([{ ...base, audience: "GUESTS" }], { ...ctx, isLoggedIn: false })).toHaveLength(1);
  });

  it("ALL — показывать всем", () => {
    expect(selectBanners([base], { ...ctx, isLoggedIn: true })).toHaveLength(1);
    expect(selectBanners([base], { ...ctx, isLoggedIn: false })).toHaveLength(1);
  });
});

describe("selectBanners — сегмент", () => {
  it("NEW — показывать только новым клиентам", () => {
    const b = { ...base, audience: "LOGGED_IN", segment: "NEW" };
    expect(selectBanners([b], { ...ctx, isLoggedIn: true, isNew: true })).toHaveLength(1);
    expect(selectBanners([b], { ...ctx, isLoggedIn: true, isNew: false })).toHaveLength(0);
  });

  it("RETURNING — показывать только вернувшимся", () => {
    const b = { ...base, audience: "LOGGED_IN", segment: "RETURNING" };
    expect(selectBanners([b], { ...ctx, isLoggedIn: true, isNew: false })).toHaveLength(1);
    expect(selectBanners([b], { ...ctx, isLoggedIn: true, isNew: true })).toHaveLength(0);
  });

  it("сегмент не применяется к гостям", () => {
    expect(selectBanners([{ ...base, segment: "NEW" }], { ...ctx, isLoggedIn: false, isNew: false })).toHaveLength(1);
  });
});

describe("selectBanners — сортировка", () => {
  it("сортирует по sort по возрастанию", () => {
    const b1 = { ...base, id: "b1", sort: 5 };
    const b2 = { ...base, id: "b2", sort: 1 };
    const result = selectBanners([b1, b2], ctx);
    expect(result.map((b) => b.id)).toEqual(["b2", "b1"]);
  });
});

describe("bannerStatus", () => {
  it("неактивный → paused", () => {
    expect(bannerStatus({ active: false, startsAt: null, endsAt: null }, now)).toBe("paused");
  });

  it("startsAt в будущем → scheduled", () => {
    expect(bannerStatus({ active: true, startsAt: future(1), endsAt: null }, now)).toBe("scheduled");
  });

  it("endsAt в прошлом → expired", () => {
    expect(bannerStatus({ active: true, startsAt: null, endsAt: past(1) }, now)).toBe("expired");
  });

  it("активен в срок → active", () => {
    expect(bannerStatus({ active: true, startsAt: past(1), endsAt: future(1) }, now)).toBe("active");
  });

  it("без дат, активен → active", () => {
    expect(bannerStatus({ active: true, startsAt: null, endsAt: null }, now)).toBe("active");
  });
});
