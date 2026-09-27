import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { parseTelegramWidgetParams, verifyTelegramWidgetData, type TelegramWidgetData } from "@/lib/telegramWidget";

const BOT_TOKEN = "test-bot-token-123";

function makeData(overrides: Partial<TelegramWidgetData> = {}): TelegramWidgetData {
  const base: Omit<TelegramWidgetData, "hash"> = {
    id: "123456789",
    first_name: "Иван",
    username: "ivan",
    auth_date: String(Math.floor(Date.now() / 1000)),
    ...overrides,
  };
  const dataCheckString = Object.entries(base)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = crypto.createHash("sha256").update(BOT_TOKEN).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return { ...base, hash } as TelegramWidgetData;
}

describe("verifyTelegramWidgetData", () => {
  it("корректные данные проходят проверку", () => {
    expect(verifyTelegramWidgetData(makeData(), BOT_TOKEN)).toBe(true);
  });

  it("неверный hash отклоняется", () => {
    const data = makeData();
    expect(verifyTelegramWidgetData({ ...data, hash: "0".repeat(64) }, BOT_TOKEN)).toBe(false);
  });

  it("данные старше 24 часов отклоняются", () => {
    const data = makeData({ auth_date: String(Math.floor(Date.now() / 1000) - 86401) });
    expect(verifyTelegramWidgetData(data, BOT_TOKEN)).toBe(false);
  });

  it("неверный токен бота отклоняется", () => {
    expect(verifyTelegramWidgetData(makeData(), "other-token")).toBe(false);
  });

  it("без username — проверка всё равно работает", () => {
    expect(verifyTelegramWidgetData(makeData({ username: undefined }), BOT_TOKEN)).toBe(true);
  });
});

describe("parseTelegramWidgetParams", () => {
  it("парсит полные параметры", () => {
    const data = makeData();
    const params = new URLSearchParams(Object.entries(data).filter(([, v]) => v !== undefined) as [string, string][]);
    const parsed = parseTelegramWidgetParams(params);
    expect(parsed?.id).toBe("123456789");
    expect(parsed?.hash).toBe(data.hash);
  });

  it("возвращает null при отсутствии обязательных полей", () => {
    expect(parseTelegramWidgetParams(new URLSearchParams())).toBeNull();
    expect(parseTelegramWidgetParams(new URLSearchParams("id=1&hash=abc"))).toBeNull();
    expect(parseTelegramWidgetParams(new URLSearchParams("id=1&auth_date=1"))).toBeNull();
  });
});
