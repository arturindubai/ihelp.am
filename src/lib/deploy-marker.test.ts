import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { describe, it, expect } from "vitest";

// src/lib монтируется в Docker-образе проверки (-v $PWD/src:/app/src),
// deploy/ и scripts/ тоже монтируются check.sh чтобы эти тесты работали.
const dir = dirname(fileURLToPath(import.meta.url));

function tryRead(relPath: string): string | null {
  const p = resolve(dir, relPath);
  return existsSync(p) ? readFileSync(p, "utf-8") : null;
}

describe("deploy-marker", () => {
  it("метка из deploy-marker.txt — непустая строка заглавными буквами, пригодная для grep -F", () => {
    // update.sh пишет содержимое файла в лог перед docker compose up,
    // deploy-task.sh читает тот же файл и ищет строку через grep -qF.
    // Оба скрипта используют один источник — расхождение невозможно.
    const marker = readFileSync(join(dir, "deploy-marker.txt"), "utf-8").trim();
    expect(marker.length, "метка не пустая").toBeGreaterThan(0);
    expect(marker, "только заглавные буквы и подчёркивание").toMatch(/^[A-Z_]+$/);
  });

  it("update.sh выводит метку из deploy-marker.txt до docker compose up", () => {
    const src = tryRead("../../deploy/update.sh");
    if (!src) return; // deploy/ не смонтирован — пропускаем
    // Строка вида: echo "$(< src/lib/deploy-marker.txt)"
    expect(src, "update.sh должен выводить содержимое deploy-marker.txt").toMatch(
      /echo.*deploy-marker\.txt/
    );
    const echoPos = src.search(/echo.*deploy-marker\.txt/);
    const upPos = src.search(/docker compose up/);
    expect(
      echoPos,
      "вывод метки должен быть ДО docker compose up — иначе при провале smoke метки в логе не будет"
    ).toBeLessThan(upPos);
  });

  it("deploy-task.sh читает метку из того же файла и ищет её grep -qF в логе", () => {
    const src = tryRead("../../scripts/deploy-task.sh");
    if (!src) return; // scripts/ не смонтирован — пропускаем
    // Строка вида: prod_marker=$(< src/lib/deploy-marker.txt)
    expect(
      src,
      "deploy-task.sh должен читать метку из deploy-marker.txt, а не хардкодить"
    ).toMatch(/prod_marker=.*deploy-marker\.txt/);
    // Строка вида: grep -qF "$prod_marker" "$log"
    expect(
      src,
      'deploy-task.sh должен искать метку через grep -qF "$prod_marker" "$log"'
    ).toMatch(/grep\s+-qF\s+"\$prod_marker"\s+"\$log"/);
  });
});
