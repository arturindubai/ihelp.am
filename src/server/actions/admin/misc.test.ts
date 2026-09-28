import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../audit", () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../notify", () => ({
  html: (strings: TemplateStringsArray, ...vals: unknown[]) =>
    strings.reduce((acc, s, i) => acc + s + (vals[i] ?? ""), ""),
  notifyTech: vi.fn().mockResolvedValue(undefined),
  notifyTeam: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../settings", () => ({
  invalidateUiCache: vi.fn(),
  saveSettingsSection: vi.fn(),
  getSettings: vi.fn(),
  SECRET_PATHS: [],
}));
vi.mock("../../contacts", () => ({ envContacts: vi.fn().mockReturnValue({}) }));
vi.mock("../../services/mail", () => ({ sendMail: vi.fn(), mailTemplate: vi.fn() }));
vi.mock("../../services/telegramBot", () => ({ registerTelegramWebhook: vi.fn() }));
vi.mock("@/lib/telegramAuth", () => ({ telegramWebhookSecret: vi.fn() }));
vi.mock("../../services/catalog", () => ({ recalcRatings: vi.fn() }));

const mockFindUnique = vi.fn();
const mockCount = vi.fn();
const mockUpsert = vi.fn();
const mockDeleteMany = vi.fn().mockResolvedValue({});

vi.mock("../../db", () => ({
  db: {
    user: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      count: (...a: unknown[]) => mockCount(...a),
      upsert: (...a: unknown[]) => mockUpsert(...a),
    },
    session: { deleteMany: (...a: unknown[]) => mockDeleteMany(...a) },
  },
}));

const mockRequireSection = vi.fn();
vi.mock("../../admin", () => ({ requireSection: (...a: unknown[]) => mockRequireSection(...a) }));

import { setRoleAction } from "./misc";
import { notifyTech } from "../../notify";

const SELF = { id: "owner-1", phone: "+37494000001", role: "OWNER" as const };
const OTHER_OWNER = { id: "owner-2", phone: "+37494000002", role: "OWNER" as const };
const OPERATOR = { id: "op-1", phone: "+37494000003", role: "OPERATOR" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSection.mockResolvedValue(SELF);
  mockUpsert.mockResolvedValue({ id: "owner-1" });
  mockDeleteMany.mockResolvedValue({});
});

describe("setRoleAction — защита роли OWNER", () => {
  it("отклоняет понижение другого владельца (вариант А)", async () => {
    mockFindUnique.mockResolvedValue(OTHER_OWNER);
    const r = await setRoleAction(OTHER_OWNER.phone, "CLIENT");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toBe("cannotRemoveOwner");
  });

  it("отклоняет понижение последнего владельца (себя)", async () => {
    mockFindUnique.mockResolvedValue(SELF);
    mockCount.mockResolvedValue(1);
    const r = await setRoleAction(SELF.phone, "CLIENT");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toBe("lastOwner");
  });

  it("разрешает владельцу понизить себя, если владельцев больше одного", async () => {
    mockFindUnique.mockResolvedValue(SELF);
    mockCount.mockResolvedValue(2);
    mockUpsert.mockResolvedValue({ id: SELF.id });
    const r = await setRoleAction(SELF.phone, "CLIENT");
    expect(r.ok).toBe(true);
  });

  it("не проверяет счётчик для чужого владельца (отклоняет до проверки счётчика)", async () => {
    mockFindUnique.mockResolvedValue(OTHER_OWNER);
    await setRoleAction(OTHER_OWNER.phone, "CLIENT");
    expect(mockCount).not.toHaveBeenCalled();
  });

  it("отклоняет понижение владельца при phone === u.phone и ownerCount === 1", async () => {
    mockFindUnique.mockResolvedValue(SELF);
    mockCount.mockResolvedValue(1);
    const r = await setRoleAction(SELF.phone, "ADMIN");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toBe("lastOwner");
  });
});

describe("setRoleAction — тех-алерт при смене роли владельца", () => {
  it("отправляет тех-алерт, когда владелец понижает себя", async () => {
    mockFindUnique.mockResolvedValue(SELF);
    mockCount.mockResolvedValue(2);
    mockUpsert.mockResolvedValue({ id: SELF.id });
    await setRoleAction(SELF.phone, "CLIENT");
    expect(notifyTech).toHaveBeenCalledOnce();
  });

  it("отправляет тех-алерт при повышении до OWNER", async () => {
    mockFindUnique.mockResolvedValue(OPERATOR);
    mockUpsert.mockResolvedValue({ id: OPERATOR.id });
    await setRoleAction(OPERATOR.phone, "OWNER");
    expect(notifyTech).toHaveBeenCalledOnce();
  });

  it("не отправляет тех-алерт при смене роли не-владельца", async () => {
    mockFindUnique.mockResolvedValue(OPERATOR);
    mockUpsert.mockResolvedValue({ id: OPERATOR.id });
    await setRoleAction(OPERATOR.phone, "ADMIN");
    expect(notifyTech).not.toHaveBeenCalled();
  });
});

describe("setRoleAction — обычные роли", () => {
  it("запрещает себе менять роль в не-OWNER (старая защита)", async () => {
    mockFindUnique.mockResolvedValue(OPERATOR);
    // вызывающий и цель — один и тот же не-владелец
    mockRequireSection.mockResolvedValue({ id: "op-1", phone: OPERATOR.phone, role: "OPERATOR" });
    const r = await setRoleAction(OPERATOR.phone, "CLIENT");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toBe("self");
  });

  it("принимает невалидный телефон", async () => {
    const r = await setRoleAction("not-a-phone", "OPERATOR");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toBe("phone");
  });

  it("принимает смену роли не-владельца", async () => {
    mockFindUnique.mockResolvedValue(OPERATOR);
    mockUpsert.mockResolvedValue({ id: OPERATOR.id });
    const r = await setRoleAction(OPERATOR.phone, "ADMIN");
    expect(r.ok).toBe(true);
  });
});
