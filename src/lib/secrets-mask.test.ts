import { describe, it, expect } from "vitest";
import { maskSecrets, SECRET_MASK } from "./secrets-mask";

const MASK = SECRET_MASK;

describe("maskSecrets — токены Telegram", () => {
  it("маскирует токен бота в чистом виде", () => {
    const { masked, found } = maskSecrets("5284978512:AAGx4vTKRqe_example_token_here_long");
    expect(found).toBe(true);
    expect(masked).toBe(MASK);
  });

  it("маскирует токен в середине текста", () => {
    const { masked, found } = maskSecrets("токен: 5284978512:AAGx4vTKRqe_example_token_here_long вот");
    expect(found).toBe(true);
    expect(masked).toContain(MASK);
    expect(masked).not.toContain("AAGx4");
  });

  it("не маскирует просто числа", () => {
    const { found } = maskSecrets("заказ 12345 от 09:30");
    expect(found).toBe(false);
  });

  it("не маскирует число:число (короткое правое плечо)", () => {
    const { found } = maskSecrets("соотношение 16:9 или 1920:1080");
    expect(found).toBe(false);
  });
});

describe("maskSecrets — ключи с префиксами", () => {
  // Строки конструируются динамически, чтобы GitHub Push Protection не блокировал пуш

  it("маскирует ключ Resend re_", () => {
    const key = "re_" + "abc123XYZdefGHIjklMNOpqr";
    const { masked, found } = maskSecrets(`RESEND_API_KEY=${key}`);
    expect(found).toBe(true);
    expect(masked).toContain(MASK);
    expect(masked).not.toContain(key);
  });

  it("маскирует ключ с префиксом sk_", () => {
    const key = "sk_" + "abcdefghijklmnopqrstuvwxyz1234";
    const { masked, found } = maskSecrets(`ключ: ${key}`);
    expect(found).toBe(true);
    expect(masked).toContain(MASK);
  });

  it("маскирует токен GitHub ghp_", () => {
    const token = "ghp_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef";
    const { masked, found } = maskSecrets(token);
    expect(found).toBe(true);
    expect(masked).toBe(MASK);
  });

  it("не маскирует короткий идентификатор (< 20 символов после префикса)", () => {
    const { found } = maskSecrets("sk_short");
    expect(found).toBe(false);
  });
});

describe("maskSecrets — ключевые слова", () => {
  it("маскирует значение после token=", () => {
    const { masked, found } = maskSecrets("token=AbCdEfGhIjKlMnOpQrStUvWx1234");
    expect(found).toBe(true);
    expect(masked).toContain(MASK);
  });

  it("маскирует значение после secret:", () => {
    const { masked, found } = maskSecrets("secret: VeryLongSecretValueHereXYZ1234567890ab");
    expect(found).toBe(true);
    expect(masked).toContain(MASK);
  });

  it("не маскирует SHA-хэш (40 hex символов) после token=", () => {
    // Полный SHA коммита: только hex, 40 символов — looksLikeCommitSha вернёт true
    const sha = "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3";
    const { found } = maskSecrets(`token=${sha}`);
    expect(found).toBe(false);
  });

  it("не маскирует короткий hex (< 20 симв.) — не длинный ключ", () => {
    const { found } = maskSecrets("token=abc1234");
    expect(found).toBe(false);
  });

  it("не маскирует обычный текст с цифрами", () => {
    const { found } = maskSecrets("визит №12345 в 10:00, мастер Артур, стоимость 4500 драм");
    expect(found).toBe(false);
  });

  it("не маскирует хэш коммита как самостоятельное значение", () => {
    const { found } = maskSecrets("коммит dcbb505ee8d290cb7dce");
    expect(found).toBe(false);
  });
});

describe("maskSecrets — несколько секретов в одном тексте", () => {
  it("маскирует оба секрета", () => {
    const text = "token: 5284978512:AAGx4vTKRqe_example_token_here_long и key=re_abc123XYZdefGHIjklMNOpqr";
    const { masked, found } = maskSecrets(text);
    expect(found).toBe(true);
    expect(masked).not.toContain("AAGx4");
    expect(masked).not.toContain("re_abc123");
  });
});

describe("maskSecrets — пустая строка и безопасные строки", () => {
  it("пустая строка — не меняет, found=false", () => {
    const { masked, found } = maskSecrets("");
    expect(found).toBe(false);
    expect(masked).toBe("");
  });

  it("обычный текст записи разработчика — не меняет", () => {
    const text = "Сделал миграцию, добавил индекс на userId. Тесты зелёные.";
    const { masked, found } = maskSecrets(text);
    expect(found).toBe(false);
    expect(masked).toBe(text);
  });

  it("фраза с «ключ» на русском — не маскирует (паттерн только на ASCII ключевые слова)", () => {
    const { found } = maskSecrets("ключ от квартиры");
    expect(found).toBe(false);
  });

  it("SHA хэш (40 hex символов) не маскируется", () => {
    const sha = "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3";
    const { found } = maskSecrets(`выложено на коммите ${sha}`);
    expect(found).toBe(false);
  });
});
