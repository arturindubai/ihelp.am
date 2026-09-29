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

  it("cc.mjs done проверяет тему коммита перед проверкой scope — чужой коммит без нужной темы не пройдёт", () => {
    const src = tryRead("../../scripts/cc.mjs");
    if (!src) return;
    // Первичная проверка — тема «Слияние task/KEY:» или «Слияние пачки task/KEY:»
    expect(src, "cc.mjs done должна проверять тему коммита для идентификации слияния задачи")
      .toMatch(/Слияние task\//);
    expect(src, "cc.mjs done должна проверять тему коммита для пачковых слияний")
      .toMatch(/Слияние пачки task\//);
    // Ошибка при чужом коммите должна говорить, что это не слияние ветки задачи
    expect(src, "cc.mjs done должна отклонять чужой коммит с понятным сообщением")
      .toMatch(/не является слиянием ветки/);
  });

  it("deploy-batch.sh закрывает каждую задачу пачки её собственным коммитом (BATCH_MERGE_SHAS)", () => {
    const src = tryRead("../../scripts/deploy-batch.sh");
    if (!src) return;
    expect(src, "deploy-batch.sh должна хранить SHA для каждой задачи отдельно")
      .toMatch(/BATCH_MERGE_SHAS/);
    expect(src, "deploy-batch.sh должна записывать SHA после каждого слияния")
      .toMatch(/BATCH_MERGE_SHAS\[/);
    expect(src, "deploy-batch.sh должна закрывать задачи с per-task SHA")
      .toMatch(/BATCH_MERGE_SHAS\[.*\]:-/);
  });

  it("deploy-task.sh и deploy-batch.sh обнаруживают задачи, уже влитые в origin/main", () => {
    const bsrc = tryRead("../../scripts/deploy-batch.sh");
    const tsrc = tryRead("../../scripts/deploy-task.sh");
    const mergeLogPattern = /git log.*--merges.*--first-parent/;
    if (bsrc) expect(bsrc, "deploy-batch.sh должна искать уже влитые задачи через git log --merges").toMatch(mergeLogPattern);
    if (tsrc) expect(tsrc, "deploy-task.sh должна искать уже влитые задачи через git log --merges").toMatch(mergeLogPattern);
  });

  it("deploy-task.sh блокирует задачу на технике при сбое cc done (не оставляет в очереди деплоера)", () => {
    const src = tryRead("../../scripts/deploy-task.sh");
    if (!src) return;
    expect(src, "deploy-task.sh должна вызывать cc block при сбое cc done")
      .toMatch(/cc block.*--on tech/);
  });

  it("test-rollback.sh отказывает при имени проекта homecare (защита образов прода)", () => {
    const src = tryRead("../../scripts/test-rollback.sh");
    if (!src) return; // scripts/ не смонтирован — пропускаем
    // Скрипт должен явно проверять имя проекта "homecare" и вызывать exit 1
    expect(
      src,
      'test-rollback.sh должен отказывать при --project homecare'
    ).toMatch(/"homecare".*exit 1/s);
    // Скрипт должен требовать формат ihelp-stand-*
    expect(
      src,
      'test-rollback.sh должен требовать формат ihelp-stand-*'
    ).toMatch(/ihelp-stand-\*/);
    // Скрипт должен передавать ROLLBACK_IMAGE_PREFIX в rollback.sh — не трогает homecare-* теги
    expect(
      src,
      'test-rollback.sh должен передавать ROLLBACK_IMAGE_PREFIX в rollback.sh'
    ).toMatch(/ROLLBACK_IMAGE_PREFIX/);
  });
});
