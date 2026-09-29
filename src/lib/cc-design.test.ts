import { describe, it, expect } from "vitest";
import { hasMockup, isPendingApproval, isWaitingMockup, mockupHold } from "./cc-design";

describe("hasMockup", () => {
  it("возвращает true если есть mockupUrl", () => {
    expect(hasMockup({ mockupUrl: "https://figma.com/file/abc" })).toBe(true);
  });
  it("возвращает true если есть загруженные картинки", () => {
    expect(hasMockup({ imageAttachments: [{ url: "/uploads/img.png" }] })).toBe(true);
  });
  it("возвращает false если нет ни ссылки, ни картинок", () => {
    expect(hasMockup({})).toBe(false);
    expect(hasMockup({ mockupUrl: null, imageAttachments: [] })).toBe(false);
  });
  it("пустая строка в mockupUrl — не макет", () => {
    expect(hasMockup({ mockupUrl: "" })).toBe(false);
  });
});

describe("isPendingApproval — блок «На согласовании»", () => {
  const base = { status: "ready", mockupApprovedBy: null };
  it("открытая задача с mockupUrl → в блоке", () => {
    expect(isPendingApproval({ ...base, mockupUrl: "https://figma.com/x" })).toBe(true);
  });
  it("открытая задача с картинкой → в блоке", () => {
    expect(isPendingApproval({ ...base, imageAttachments: [{}] })).toBe(true);
  });
  it("задача с флагом нужен-макет, но без макета → НЕ в блоке согласования", () => {
    expect(isPendingApproval({ ...base, mockupUrl: null, imageAttachments: [] })).toBe(false);
  });
  it("завершённая задача с макетом → не в блоке", () => {
    expect(isPendingApproval({ status: "done", mockupApprovedBy: null, mockupUrl: "https://x" })).toBe(false);
  });
  it("уже утверждённая задача → не в блоке", () => {
    expect(isPendingApproval({ status: "ready", mockupApprovedBy: "owner", mockupUrl: "https://x" })).toBe(false);
  });
});

describe("isWaitingMockup — блок «Ждёт макета»", () => {
  const base = { status: "ready", mockupApprovedBy: null, mockupRequired: true };
  it("задача с флагом и без макета → в блоке ожидания", () => {
    expect(isWaitingMockup({ ...base, mockupUrl: null, imageAttachments: [] })).toBe(true);
  });
  it("задача с флагом и mockupUrl → НЕ в ожидании, уже есть макет", () => {
    expect(isWaitingMockup({ ...base, mockupUrl: "https://figma.com/x" })).toBe(false);
  });
  it("задача с флагом и картинкой → НЕ в ожидании", () => {
    expect(isWaitingMockup({ ...base, imageAttachments: [{}] })).toBe(false);
  });
  it("задача без флага нужен-макет → не в ожидании даже без макета", () => {
    expect(isWaitingMockup({ ...base, mockupRequired: false, mockupUrl: null })).toBe(false);
  });
  it("завершённая задача → не в ожидании", () => {
    expect(isWaitingMockup({ ...base, status: "done", mockupUrl: null })).toBe(false);
  });
  it("отменённая задача → не в ожидании", () => {
    expect(isWaitingMockup({ ...base, status: "cancelled", mockupUrl: null })).toBe(false);
  });
  it("утверждённая задача → не в ожидании", () => {
    expect(isWaitingMockup({ ...base, mockupApprovedBy: "owner", mockupUrl: null })).toBe(false);
  });
});

describe("isPendingApproval — возврат дизайнеру (DEV-111)", () => {
  it("заблокирована на дизайне без макета → НЕ на согласовании (возврат из блокировки на владельце)", () => {
    expect(isPendingApproval({ status: "blocked", blockedOn: "design", mockupApprovedBy: null, mockupUrl: null, imageAttachments: [] })).toBe(false);
  });
  it("заблокирована на дизайне без макета → НЕ на согласовании (возврат из «В очереди»)", () => {
    expect(isPendingApproval({ status: "blocked", blockedOn: "design", mockupApprovedBy: null })).toBe(false);
  });
  it("заблокирована на дизайне без макета → НЕ на согласовании (возврат из «В работе»)", () => {
    expect(isPendingApproval({ status: "blocked", blockedOn: "design", mockupApprovedBy: null, mockupUrl: null })).toBe(false);
  });
  it("заблокирована на дизайне с новым mockupUrl → на согласовании (дизайнер прислал новый макет)", () => {
    expect(isPendingApproval({ status: "blocked", blockedOn: "design", mockupApprovedBy: null, mockupUrl: "https://figma.com/new" })).toBe(true);
  });
  it("заблокирована на дизайне с новой картинкой → на согласовании (дизайнер загрузил изображение)", () => {
    expect(isPendingApproval({ status: "blocked", blockedOn: "design", mockupApprovedBy: null, mockupUrl: null, imageAttachments: [{}] })).toBe(true);
  });
  it("заблокирована на владельце с макетом → на согласовании", () => {
    expect(isPendingApproval({ status: "blocked", blockedOn: "owner", mockupApprovedBy: null, mockupUrl: "https://figma.com/x" })).toBe(true);
  });
});

describe("mockupHold — что держит дизайн задачи", () => {
  it("заблокирована на владельце → owner", () => {
    expect(mockupHold({ status: "blocked", blockedOn: "owner" })).toBe("owner");
  });
  it("заблокирована на продакте → product", () => {
    expect(mockupHold({ status: "blocked", blockedOn: "product" })).toBe("product");
  });
  it("в работе у дизайнера → active", () => {
    expect(mockupHold({ status: "in_progress", claimedBy: "designer-1" })).toBe("active");
  });
  it("готова к работе → queue", () => {
    expect(mockupHold({ status: "ready" })).toBe("queue");
  });
  it("бэклог → queue", () => {
    expect(mockupHold({ status: "backlog" })).toBe("queue");
  });
});
