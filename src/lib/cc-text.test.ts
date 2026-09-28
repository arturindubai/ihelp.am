import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync, spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveText, shouldReadStdin } from "./cc-text";

describe("resolveText", () => {
  it("возвращает текст из аргумента при пустом stdin", () => {
    expect(resolveText({ positional: ["KEY", "текст из аргумента"], stdinContent: "", skipFirst: true })).toBe("текст из аргумента");
  });

  it("возвращает текст из аргумента при null stdin (stdin не читался)", () => {
    expect(resolveText({ positional: ["KEY", "текст из аргумента"], stdinContent: null, skipFirst: true })).toBe("текст из аргумента");
  });

  it("файл приоритетнее аргумента и stdin", () => {
    expect(resolveText({ fileContent: "из файла", positional: ["KEY", "аргумент"], stdinContent: "stdin", skipFirst: true })).toBe("из файла");
  });

  it("аргумент приоритетнее непустого stdin", () => {
    expect(resolveText({ positional: ["KEY", "из аргумента"], stdinContent: "из stdin", skipFirst: true })).toBe("из аргумента");
  });

  it("использует stdin, если нет аргументов", () => {
    expect(resolveText({ positional: ["KEY"], stdinContent: "текст из stdin", skipFirst: true })).toBe("текст из stdin");
  });

  it("возвращает пустую строку при пустом stdin и нет аргументов", () => {
    expect(resolveText({ positional: ["KEY"], stdinContent: "", skipFirst: true })).toBe("");
  });

  it("skipFirst=false — весь positional это текст (как у msg)", () => {
    expect(resolveText({ positional: ["текст сообщения"], stdinContent: null, skipFirst: false })).toBe("текст сообщения");
  });

  it("несколько слов в аргументах собираются в строку", () => {
    expect(resolveText({ positional: ["KEY", "слово1", "слово2"], stdinContent: null, skipFirst: true })).toBe("слово1 слово2");
  });
});

describe("shouldReadStdin", () => {
  it("не читает stdin в терминале", () => {
    expect(shouldReadStdin({ isTTY: true, hasTextFile: false, cmd: "note", positional: ["KEY"] })).toBe(false);
  });

  it("не читает stdin при --text-file", () => {
    expect(shouldReadStdin({ isTTY: false, hasTextFile: true, cmd: "note", positional: ["KEY"] })).toBe(false);
  });

  it("не читает stdin при наличии текста в аргументах (note KEY текст)", () => {
    expect(shouldReadStdin({ isTTY: false, hasTextFile: false, cmd: "note", positional: ["KEY", "текст"] })).toBe(false);
  });

  it("читает stdin, когда нет текста в аргументах (note KEY)", () => {
    expect(shouldReadStdin({ isTTY: false, hasTextFile: false, cmd: "note", positional: ["KEY"] })).toBe(true);
  });

  it("не читает stdin для intake с текстом в аргументах", () => {
    expect(shouldReadStdin({ isTTY: false, hasTextFile: false, cmd: "intake", positional: ["текст задачи"] })).toBe(false);
  });

  it("читает stdin для intake без аргументов", () => {
    expect(shouldReadStdin({ isTTY: false, hasTextFile: false, cmd: "intake", positional: [] })).toBe(true);
  });

  it("не читает stdin для done KEY --sha SHA текст (pos.length > 1)", () => {
    expect(shouldReadStdin({ isTTY: false, hasTextFile: false, cmd: "done", positional: ["KEY", "Автовыкладка..."] })).toBe(false);
  });

  // Нетекстовые команды не читают stdin вне зависимости от аргументов
  it("не читает stdin для show (нетекстовая команда)", () => {
    expect(shouldReadStdin({ isTTY: false, hasTextFile: false, cmd: "show", positional: ["KEY"] })).toBe(false);
  });

  it("не читает stdin для take (нетекстовая команда)", () => {
    expect(shouldReadStdin({ isTTY: false, hasTextFile: false, cmd: "take", positional: ["KEY"] })).toBe(false);
  });

  it("не читает stdin для next (нетекстовая команда)", () => {
    expect(shouldReadStdin({ isTTY: false, hasTextFile: false, cmd: "next", positional: [] })).toBe(false);
  });

  it("не читает stdin для pulse (нетекстовая команда)", () => {
    expect(shouldReadStdin({ isTTY: false, hasTextFile: false, cmd: "pulse", positional: ["KEY"] })).toBe(false);
  });

  it("не читает stdin для list (нетекстовая команда)", () => {
    expect(shouldReadStdin({ isTTY: false, hasTextFile: false, cmd: "list", positional: [] })).toBe(false);
  });
});

// Процессный тест: stdin открыт и молчит — процесс должен завершиться по таймауту, не зависнуть.
// Тест не зависит от scripts/cc.mjs: запускает inline-скрипт с той же логикой таймаута что в cc.mjs.
// Скрипт пишется во временный файл чтобы избежать проблем с escaping переносов строк в shell.
describe("stdin timeout — процессный тест", () => {
  let tmpDir: string;
  let scriptPath: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cc-text-test-"));
    scriptPath = join(tmpDir, "stdin-timeout.mjs");
    // Скрипт с той же логикой таймаута, что в cc.mjs (2 секунды ожидания данных)
    writeFileSync(scriptPath, [
      "const p = new Promise(resolve => {",
      "  let d = '', done = false;",
      "  const finish = v => { if (!done) { done = true; resolve(v); } };",
      "  const t = setTimeout(() => finish('timeout'), 2000);",
      "  process.stdin.setEncoding('utf8');",
      "  process.stdin.on('data', c => { d += c; clearTimeout(t); });",
      "  process.stdin.on('end', () => finish(d.trim() || 'end'));",
      "  process.stdin.on('close', () => finish(d.trim() || 'close'));",
      "});",
      "p.then(r => { process.stdout.write(r); process.exit(0); });",
    ].join("\n"));
  });

  afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

  it("завершается за ~2 секунды при открытом молчащем stdin (не ждёт до конца потока)", async () => {
    // Даём скрипту открытый stdin (pipe), но ничего не пишем.
    // Скрипт должен сам завершиться по таймауту за ~2с, не зависая.
    const cp = spawn("node", [scriptPath], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    cp.stdout.on("data", (d: Buffer) => { output += d.toString(); });

    const exitCode = await new Promise<number | null>(resolve => {
      cp.on("exit", (code) => resolve(code));
      // Если не вышел за 3.5с — убиваем, это зависание
      setTimeout(() => { cp.kill(); resolve(null); }, 3500);
    });

    // null = убит по таймауту = зависание
    expect(exitCode).toBe(0);
    expect(output.trim()).toBe("timeout");
  }, 6000);

  it("принимает данные из stdin до завершения потока (не обрывает на таймауте)", () => {
    // spawnSync с input: скрипт получает данные сразу и видит end
    const result = spawnSync(
      "node",
      [scriptPath],
      { input: "hello-from-stdin", timeout: 4000 }
    );
    expect(result.status).toBe(0);
    expect(result.stdout?.toString().trim()).toBe("hello-from-stdin");
  }, 6000);
});
