import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  categoryFindUnique: vi.fn(),
  serviceFindUnique: vi.fn(),
  interestCount: vi.fn().mockResolvedValue(0),
  interestCreate: vi.fn().mockResolvedValue({ id: "1" }),
  isValidContact: vi.fn().mockReturnValue(true),
  normalizeEmail: vi.fn().mockReturnValue(null),
  normalizePhone: vi.fn().mockReturnValue("+37491000000"),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(null) }),
}));

vi.mock("../../db", () => ({
  db: {
    category: { findUnique: mocks.categoryFindUnique },
    service: { findUnique: mocks.serviceFindUnique },
    serviceInterest: {
      count: mocks.interestCount,
      create: mocks.interestCreate,
    },
  },
}));

vi.mock("@/lib/contactValidation", () => ({ isValidContact: mocks.isValidContact }));
vi.mock("@/lib/email", () => ({ normalizeEmail: mocks.normalizeEmail }));
vi.mock("@/lib/phone", () => ({ normalizePhone: mocks.normalizePhone }));

import { submitServiceInterest } from "../catalog";

describe("submitServiceInterest — валидация", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isValidContact.mockReturnValue(true);
    mocks.normalizeEmail.mockReturnValue(null);
    mocks.normalizePhone.mockReturnValue("+37491000000");
    mocks.interestCount.mockResolvedValue(0);
    mocks.interestCreate.mockResolvedValue({ id: "1" });
  });

  it("пустой контакт → invalid", async () => {
    const r = await submitServiceInterest("chef", "");
    expect(r).toBe("invalid");
  });

  it("некорректный формат контакта → invalid", async () => {
    mocks.isValidContact.mockReturnValue(false);
    const r = await submitServiceInterest("chef", "не_контакт");
    expect(r).toBe("invalid");
  });

  it("slug не comingSoon → invalid (категория и услуга не найдены)", async () => {
    mocks.categoryFindUnique.mockResolvedValue(null);
    mocks.serviceFindUnique.mockResolvedValue(null);
    const r = await submitServiceInterest("cleaning", "+37491000000");
    expect(r).toBe("invalid");
  });

  it("slug существующей категории без comingSoon → invalid", async () => {
    mocks.categoryFindUnique.mockResolvedValue({ comingSoon: false });
    mocks.serviceFindUnique.mockResolvedValue(null);
    const r = await submitServiceInterest("cleaning", "+37491000000");
    expect(r).toBe("invalid");
  });

  it("comingSoon-категория → ok, сохраняет kind=category", async () => {
    mocks.categoryFindUnique.mockResolvedValue({ comingSoon: true });
    mocks.serviceFindUnique.mockResolvedValue(null);
    const r = await submitServiceInterest("chef", "+37491000000");
    expect(r).toBe("ok");
    expect(mocks.interestCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "category", serviceSlug: "chef" }) }),
    );
  });

  it("comingSoon-услуга → ok, сохраняет kind=service", async () => {
    mocks.categoryFindUnique.mockResolvedValue(null);
    mocks.serviceFindUnique.mockResolvedValue({ comingSoon: true });
    const r = await submitServiceInterest("deep-clean-express", "+37491000000");
    expect(r).toBe("ok");
    expect(mocks.interestCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "service", serviceSlug: "deep-clean-express" }) }),
    );
  });

  it("услуга найдена, но comingSoon=false → invalid", async () => {
    mocks.categoryFindUnique.mockResolvedValue(null);
    mocks.serviceFindUnique.mockResolvedValue({ comingSoon: false });
    const r = await submitServiceInterest("deep-clean", "+37491000000");
    expect(r).toBe("invalid");
  });

  it("дублирующийся контакт (P2002) → already", async () => {
    mocks.categoryFindUnique.mockResolvedValue({ comingSoon: true });
    mocks.serviceFindUnique.mockResolvedValue(null);
    mocks.interestCreate.mockRejectedValue({ code: "P2002" });
    const r = await submitServiceInterest("chef", "+37491000000");
    expect(r).toBe("already");
  });
});
