import { describe, expect, it } from "vitest";
import { telegramWebhookSecret, verifyTelegramWebhookSecret } from "@/lib/telegramAuth";

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
