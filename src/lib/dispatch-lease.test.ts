import { describe, it, expect } from "vitest";
import { shouldReleaseAgentBusy, staleHeartbeatForClaim } from "./dispatch-lease";

describe("shouldReleaseAgentBusy", () => {
  const now = new Date("2026-09-28T10:00:00Z");
  const recentPulse = new Date("2026-09-28T09:55:00Z"); // 5 мин назад — свежий
  const stalePulse = new Date("2026-09-28T09:45:00Z");  // 15 мин назад — устарел

  it("свежий пульс — аренда остаётся (критерий 1)", () => {
    expect(shouldReleaseAgentBusy(false, recentPulse, now)).toBe(false);
  });

  it("активный процесс — аренда остаётся (критерий 1)", () => {
    expect(shouldReleaseAgentBusy(true, stalePulse, now)).toBe(false);
  });

  it("активный процесс и свежий пульс — аренда остаётся", () => {
    expect(shouldReleaseAgentBusy(true, recentPulse, now)).toBe(false);
  });

  it("пульса нет и процесса нет — аренда снимается (критерий 1)", () => {
    expect(shouldReleaseAgentBusy(false, null, now)).toBe(true);
  });

  it("пульс устарел и процесса нет — аренда снимается (критерий 1)", () => {
    expect(shouldReleaseAgentBusy(false, stalePulse, now)).toBe(true);
  });

  it("активный процесс, пульса нет — аренда остаётся (процесс важнее)", () => {
    expect(shouldReleaseAgentBusy(true, null, now)).toBe(false);
  });
});

describe("staleHeartbeatForClaim", () => {
  const now = new Date("2026-09-28T10:00:00Z");

  it("запись не найдена (undefined) — не снимать аренду, неизвестное состояние", () => {
    expect(staleHeartbeatForClaim(undefined, now)).toBe(false);
  });

  it("запись найдена, пульс свежий (5 мин) — не снимать аренду", () => {
    expect(staleHeartbeatForClaim({ heartbeatAt: "2026-09-28T09:55:00Z" }, now)).toBe(false);
  });

  it("запись найдена, пульс ровно 10 мин — считать устаревшим (граница включена)", () => {
    expect(staleHeartbeatForClaim({ heartbeatAt: "2026-09-28T09:50:00Z" }, now)).toBe(true);
  });

  it("запись найдена, пульс старше 10 мин — снимать аренду", () => {
    expect(staleHeartbeatForClaim({ heartbeatAt: "2026-09-28T09:45:00Z" }, now)).toBe(true);
  });

  it("запись найдена, heartbeatAt null — считать устаревшим", () => {
    expect(staleHeartbeatForClaim({ heartbeatAt: null }, now)).toBe(true);
  });
});
