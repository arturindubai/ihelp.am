import { describe, expect, it } from "vitest";
import { pickTechRoute, hasAlertRecipient } from "./alertRoute";

const notify = { telegramBotToken: "db-token", telegramChatId: "team", techChatId: "tech" };
const noTeam = { botToken: "", members: [] };
const teamWithMembers = { botToken: "", members: [{ telegramId: 1 }] };

describe("hasAlertRecipient", () => {
  it("true: notify-токен + тех-чат", () => {
    expect(hasAlertRecipient(notify, noTeam)).toBe(true);
  });
  it("true: notify-токен + team-чат (без techChatId)", () => {
    expect(hasAlertRecipient({ ...notify, techChatId: "" }, noTeam)).toBe(true);
  });
  it("true: team-бот + members, нет чата", () => {
    expect(hasAlertRecipient({ telegramBotToken: "", telegramChatId: "", techChatId: "" }, teamWithMembers)).toBe(false);
    expect(hasAlertRecipient({ telegramBotToken: "", telegramChatId: "", techChatId: "" }, { botToken: "tok", members: [{ id: 1 }] })).toBe(true);
  });
  it("false: нет токена", () => {
    expect(hasAlertRecipient({ telegramBotToken: "", telegramChatId: "chat", techChatId: "" }, noTeam)).toBe(false);
  });
  it("false: токен есть, но нет ни чата ни members", () => {
    expect(hasAlertRecipient({ ...notify, telegramChatId: "", techChatId: "" }, noTeam)).toBe(false);
  });
});

describe("pickTechRoute", () => {
  it("uses the bot from settings and prefers the tech chat", () => {
    expect(pickTechRoute(notify, {})).toEqual({ token: "db-token", chatId: "tech", via: "settings" });
  });

  it("falls back to the team chat when the tech chat is empty", () => {
    expect(pickTechRoute({ ...notify, techChatId: "" }, {})?.chatId).toBe("team");
  });

  it("keeps settings even if the fallback is set: the fallback is only for an unreachable database", () => {
    expect(pickTechRoute(notify, { ALERT_BOT_TOKEN: "env-token", ALERT_CHAT_ID: "env-chat" })?.via).toBe("settings");
  });

  it("uses the env bot when settings are unavailable", () => {
    expect(pickTechRoute(null, { ALERT_BOT_TOKEN: " env-token ", ALERT_CHAT_ID: "env-chat" })).toEqual({ token: "env-token", chatId: "env-chat", via: "env" });
  });

  it("returns null when settings are unavailable and the fallback is incomplete", () => {
    expect(pickTechRoute(null, {})).toBeNull();
    expect(pickTechRoute(null, { ALERT_BOT_TOKEN: "env-token" })).toBeNull();
    expect(pickTechRoute(null, { ALERT_BOT_TOKEN: " ", ALERT_CHAT_ID: "env-chat" })).toBeNull();
  });
});
