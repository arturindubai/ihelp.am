import { describe, expect, it } from "vitest";
import { ownPhoneFromContact, telegramWebhookSecret, verifyTelegramWebhookSecret } from "@/lib/telegramAuth";

describe("контакт из бота: принимается только собственный (AUTH-13)", () => {
  const own = { from: { id: 111 }, chat: { id: 111, type: "private" }, contact: { phone_number: "+37441000000", user_id: 111 } };

  it("контакт, отправленный кнопкой «Поделиться номером», принимается", () => {
    expect(ownPhoneFromContact(own)).toBe("+37441000000");
  });

  it("чужой контакт (user_id другого человека) — отказ: так угоняют аккаунт по опубликованному номеру", () => {
    expect(ownPhoneFromContact({ ...own, contact: { phone_number: "+37441014713", user_id: 222 } })).toBeNull();
  });

  it("контакт без user_id (вписанный вручную) — отказ", () => {
    expect(ownPhoneFromContact({ ...own, contact: { phone_number: "+37441014713" } })).toBeNull();
  });

  it("нет отправителя — отказ", () => {
    expect(ownPhoneFromContact({ chat: own.chat, contact: own.contact })).toBeNull();
  });

  it("групповой чат и чат, чей id не равен id отправителя — отказ", () => {
    expect(ownPhoneFromContact({ ...own, chat: { id: -100500, type: "supergroup" } })).toBeNull();
    expect(ownPhoneFromContact({ ...own, chat: { id: 111 } })).toBeNull();
    expect(ownPhoneFromContact({ ...own, chat: { id: 999, type: "private" } })).toBeNull();
  });

  it("пустой номер или нет контакта — отказ", () => {
    expect(ownPhoneFromContact({ ...own, contact: { phone_number: "  ", user_id: 111 } })).toBeNull();
    expect(ownPhoneFromContact({ ...own, contact: undefined })).toBeNull();
  });
});

describe("вебхук Telegram-бота", () => {
  it("секрет детерминирован и проходит проверку", () => {
    const secret = telegramWebhookSecret("session-secret");
    expect(verifyTelegramWebhookSecret(secret, "session-secret")).toBe(true);
  });

  it("чужой или пустой заголовок отклоняется", () => {
    expect(verifyTelegramWebhookSecret("мусор", "session-secret")).toBe(false);
    expect(verifyTelegramWebhookSecret(null, "session-secret")).toBe(false);
    expect(verifyTelegramWebhookSecret(telegramWebhookSecret("другой-секрет"), "session-secret")).toBe(false);
  });
});
