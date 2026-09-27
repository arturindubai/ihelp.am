import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";

// src/lib монтируется в Docker-образе проверки (-v $PWD/src:/app/src),
// поэтому тест работает в обоих режимах: на хосте и в образе homecare-migrate.
const dir = dirname(fileURLToPath(import.meta.url));

describe("deploy-marker", () => {
  it("метка из deploy-marker.txt — непустая строка заглавными буквами, пригодная для grep -F", () => {
    // update.sh пишет содержимое файла в лог перед docker compose up,
    // deploy-task.sh читает тот же файл и ищет строку через grep -qF.
    // Оба скрипта используют один источник — расхождение невозможно.
    const marker = readFileSync(join(dir, "deploy-marker.txt"), "utf-8").trim();
    expect(marker.length, "метка не пустая").toBeGreaterThan(0);
    expect(marker, "только заглавные буквы и подчёркивание").toMatch(/^[A-Z_]+$/);
  });
});
