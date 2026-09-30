import { describe, it, expect, vi, type Mock } from "vitest";

const { mockFindFirst } = vi.hoisted(() => ({ mockFindFirst: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({
  db: {
    order: { findFirst: mockFindFirst },
  },
}));
vi.mock("../settings", () => ({ getSettings: vi.fn() }));
vi.mock("../notify", () => ({ html: vi.fn(), notifyTeam: vi.fn() }));
vi.mock("./workerNotify", () => ({ notifyMasterAssigned: vi.fn() }));
vi.mock("./bookingNotify", () => ({ notifyClientOrderCreated: vi.fn() }));
vi.mock("@/lib/pricing", () => ({ calculatePrice: vi.fn() }));
vi.mock("@/lib/firstOrder", () => ({ firstOrderUsedBy: vi.fn() }));
vi.mock("@/lib/slots", () => ({ computeAllSlots: vi.fn(), isMasterFree: vi.fn() }));
vi.mock("@/lib/recurrence", () => ({ recurrenceDates: vi.fn() }));
vi.mock("@/lib/time", () => ({ addDays: vi.fn(), atYerevan: vi.fn(), hm: vi.fn(), isoWeekday: vi.fn(), ymd: vi.fn() }));
vi.mock("@/lib/format", () => ({ amd: vi.fn() }));
vi.mock("@/i18n/locales", () => ({ tr: vi.fn() }));
vi.mock("./catalog", () => ({ loadServiceRaw: vi.fn(), localizeService: vi.fn(), resolveSelection: vi.fn() }));
vi.mock("./promo", () => ({ checkPromo: vi.fn() }));

import { getLastOrderDraft } from "./booking";

function makeOrder(overrides: object = {}) {
  return {
    config: {
      service: { slug: "cleaning", title: { ru: "Уборка" } },
      options: [
        { groupId: "g1", optionId: "o1", group: "Площадь", option: "до 50 м²", price: 5000, durationMin: 120, discountable: true },
      ],
      plan: null,
      promoCode: null,
      firstOrder: true,
    },
    planId: null,
    addressId: "addr-1",
    paymentMethod: "CASH" as const,
    comment: "Позвоните за час",
    noCall: false,
    ...overrides,
  };
}

describe("getLastOrderDraft", () => {
  it("возвращает null если у клиента нет заказов", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    expect(await getLastOrderDraft("user-1")).toBeNull();
  });

  it("возвращает черновик из последнего заказа", async () => {
    mockFindFirst.mockResolvedValueOnce(makeOrder());
    const draft = await getLastOrderDraft("user-1");
    expect(draft).not.toBeNull();
    expect(draft!.serviceSlug).toBe("cleaning");
    expect(draft!.optionIds).toEqual(["o1"]);
    expect(draft!.planId).toBeNull();
    expect(draft!.addressId).toBe("addr-1");
    expect(draft!.paymentMethod).toBe("CASH");
    expect(draft!.comment).toBe("Позвоните за час");
    expect(draft!.noCall).toBe(false);
  });

  it("возвращает способ оплаты CARD", async () => {
    mockFindFirst.mockResolvedValueOnce(makeOrder({ paymentMethod: "CARD" }));
    const draft = await getLastOrderDraft("user-1");
    expect(draft!.paymentMethod).toBe("CARD");
  });

  it("возвращает planId если заказ был с тарифом", async () => {
    mockFindFirst.mockResolvedValueOnce(makeOrder({ planId: "plan-abc" }));
    const draft = await getLastOrderDraft("user-1");
    expect(draft!.planId).toBe("plan-abc");
  });

  it("возвращает null addressId если адрес не был привязан", async () => {
    mockFindFirst.mockResolvedValueOnce(makeOrder({ addressId: null }));
    const draft = await getLastOrderDraft("user-1");
    expect(draft!.addressId).toBeNull();
  });

  it("возвращает пустой optionIds если options отсутствует в config", async () => {
    mockFindFirst.mockResolvedValueOnce(makeOrder({
      config: { service: { slug: "cleaning", title: { ru: "Уборка" } } },
    }));
    const draft = await getLastOrderDraft("user-1");
    expect(draft!.optionIds).toEqual([]);
  });

  it("возвращает null если в config нет slug услуги", async () => {
    mockFindFirst.mockResolvedValueOnce(makeOrder({ config: { options: [] } }));
    expect(await getLastOrderDraft("user-1")).toBeNull();
  });

  it("запрашивает последний заказ по дате для нужного userId", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    await getLastOrderDraft("user-42");
    const call = (mockFindFirst as Mock).mock.calls.at(-1)?.[0];
    expect(call?.where).toMatchObject({ userId: "user-42" });
    expect(call?.orderBy).toMatchObject({ createdAt: "desc" });
  });

  it("передаёт noCall из заказа", async () => {
    mockFindFirst.mockResolvedValueOnce(makeOrder({ noCall: true }));
    const draft = await getLastOrderDraft("user-1");
    expect(draft!.noCall).toBe(true);
  });
});
