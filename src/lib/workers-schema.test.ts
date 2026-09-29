import { describe, expect, it } from "vitest";
import { POOLS } from "./workers";
import { poolPatchSchema, workersPatchSchema } from "./workers-schema";

describe("workersPatchSchema: пулы", () => {
  it("принимает все семь пулов из POOLS", () => {
    expect(POOLS.length).toBe(7);
    for (const p of POOLS) {
      expect(workersPatchSchema.safeParse({ pools: { [p]: { enabled: true } } }).success, `пул ${p} должен приниматься`).toBe(true);
    }
  });

  it("неизвестный ключ пула — ошибка, а не «Сохранено»", () => {
    expect(workersPatchSchema.safeParse({ pools: { unknown_pool: { enabled: true } } }).success).toBe(false);
  });

  it("пул без полей принимается (все поля опциональны)", () => {
    expect(workersPatchSchema.safeParse({ pools: { dev: {} } }).success).toBe(true);
  });
});

describe("poolPatchSchema: modelForL", () => {
  it("modelForL принимается для любого из MODELS", () => {
    expect(poolPatchSchema.safeParse({ modelForL: "opus" }).success).toBe(true);
    expect(poolPatchSchema.safeParse({ modelForL: "sonnet" }).success).toBe(true);
    expect(poolPatchSchema.safeParse({ modelForL: "haiku" }).success).toBe(true);
  });

  it("modelForL с неизвестным значением — ошибка", () => {
    expect(poolPatchSchema.safeParse({ modelForL: "gpt-4" }).success).toBe(false);
  });

  it("modelForL опциональна — пул без неё принимается", () => {
    expect(poolPatchSchema.safeParse({ model: "sonnet" }).success).toBe(true);
  });
});
