import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../audit", () => ({ audit: vi.fn().mockResolvedValue(undefined) }));

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue({});
const mockDeleteMany = vi.fn().mockResolvedValue({});

vi.mock("../../db", () => ({
  db: {
    user: { findUnique: (...a: unknown[]) => mockFindUnique(...a), update: (...a: unknown[]) => mockUpdate(...a) },
    session: { deleteMany: (...a: unknown[]) => mockDeleteMany(...a) },
  },
}));

const mockRequireSection = vi.fn();
vi.mock("../../admin", () => ({ requireSection: (...a: unknown[]) => mockRequireSection(...a) }));

import { saveStaffPermissionsAction, saveStaffLoginAction } from "./staff";

const OWNER_ME = { id: "owner-1", role: "OWNER" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSection.mockResolvedValue(OWNER_ME);
  mockUpdate.mockResolvedValue({});
  mockDeleteMany.mockResolvedValue({});
});

describe("saveStaffPermissionsAction — проверка роли цели", () => {
  it("принимает OPERATOR", async () => {
    mockFindUnique.mockResolvedValue({ id: "u1", role: "OPERATOR" });
    const r = await saveStaffPermissionsAction("u1", { added: [], removed: [] });
    expect(r.ok).toBe(true);
  });

  it("принимает ADMIN", async () => {
    mockFindUnique.mockResolvedValue({ id: "u2", role: "ADMIN" });
    const r = await saveStaffPermissionsAction("u2", { added: [], removed: [] });
    expect(r.ok).toBe(true);
  });

  it("отклоняет MASTER", async () => {
    mockFindUnique.mockResolvedValue({ id: "u3", role: "MASTER" });
    const r = await saveStaffPermissionsAction("u3", { added: [], removed: [] });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toBe("invalid_role");
  });

  it("отклоняет CLIENT", async () => {
    mockFindUnique.mockResolvedValue({ id: "u4", role: "CLIENT" });
    const r = await saveStaffPermissionsAction("u4", { added: [], removed: [] });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toBe("invalid_role");
  });

  it("отклоняет OWNER (нельзя менять права владельцу)", async () => {
    mockFindUnique.mockResolvedValue({ id: "owner-2", role: "OWNER" });
    const r = await saveStaffPermissionsAction("owner-2", { added: [], removed: [] });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toBe("invalid_role");
  });
});

describe("saveStaffLoginAction — проверка роли цели", () => {
  it("принимает OPERATOR", async () => {
    mockFindUnique.mockResolvedValue({ id: "u1", role: "OPERATOR", phone: "+79990000001" });
    const r = await saveStaffLoginAction("u1", { telegramId: "12345" });
    expect(r.ok).toBe(true);
  });

  it("принимает ADMIN", async () => {
    mockFindUnique.mockResolvedValue({ id: "u2", role: "ADMIN", phone: "+79990000002" });
    const r = await saveStaffLoginAction("u2", { telegramId: "67890" });
    expect(r.ok).toBe(true);
  });

  it("принимает MASTER", async () => {
    mockFindUnique.mockResolvedValue({ id: "u3", role: "MASTER", phone: "+79990000003" });
    const r = await saveStaffLoginAction("u3", { telegramId: "11111" });
    expect(r.ok).toBe(true);
  });

  it("отклоняет CLIENT", async () => {
    mockFindUnique.mockResolvedValue({ id: "u4", role: "CLIENT" });
    const r = await saveStaffLoginAction("u4", { telegramId: "22222" });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toBe("invalid_role");
  });

  it("отклоняет OWNER", async () => {
    mockFindUnique.mockResolvedValue({ id: "owner-2", role: "OWNER" });
    const r = await saveStaffLoginAction("owner-2", { telegramId: "33333" });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toBe("invalid_role");
  });
});

describe("saveStaffLoginAction — завершение сессий", () => {
  it("не завершает сессии при изменении только Telegram", async () => {
    mockFindUnique.mockResolvedValue({ id: "u1", role: "OPERATOR" });
    await saveStaffLoginAction("u1", { telegramId: "44444" });
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("завершает сессии при изменении телефона", async () => {
    mockFindUnique.mockResolvedValue({ id: "u1", role: "OPERATOR" });
    await saveStaffLoginAction("u1", { phone: "+37491234567" });
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("завершает сессии при изменении почты", async () => {
    mockFindUnique.mockResolvedValue({ id: "u1", role: "OPERATOR" });
    await saveStaffLoginAction("u1", { email: "new@example.com" });
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("завершает сессии при очистке почты", async () => {
    mockFindUnique.mockResolvedValue({ id: "u1", role: "OPERATOR" });
    await saveStaffLoginAction("u1", { email: "" });
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });
});
