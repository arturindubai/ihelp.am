import { describe, expect, it } from "vitest";
import { diffHunks, diffLines, diffStat, kindOfPath, titleOf } from "./library";
import { parseInline, parseMarkdown } from "./markdown";
import { KEYS, cleanKeyValue, isTelegramBotToken } from "./keys";

describe("Библиотека: вид и заголовок документа", () => {
  it("вид по пути: правила, роли, процесс, решения, спецификации, знания", () => {
    expect(kindOfPath("CLAUDE.md")).toBe("rules");
    expect(kindOfPath("docs/roles/TRIAGE.md")).toBe("role");
    expect(kindOfPath("docs/WORKERS.md")).toBe("process");
    expect(kindOfPath("docs/DECISIONS.md")).toBe("decision");
    expect(kindOfPath("docs/specs/pricing.md")).toBe("spec");
    expect(kindOfPath("docs/COMPETITORS.md")).toBe("knowledge");
  });
  it("заголовок — первая строка «# …», иначе имя файла", () => {
    expect(titleOf("intro\n# **Воркеры**\n", "WORKERS.md")).toBe("Воркеры");
    expect(titleOf("без заголовка", "notes.md")).toBe("notes.md");
  });
});

describe("Библиотека: сравнение версий", () => {
  it("находит добавленные и удалённые строки, общее не трогает", () => {
    const ops = diffLines("a\nb\nc\nd", "a\nB\nc\nd\ne");
    expect(ops).toEqual([
      { op: "same", text: "a" },
      { op: "del", text: "b" },
      { op: "add", text: "B" },
      { op: "same", text: "c" },
      { op: "same", text: "d" },
      { op: "add", text: "e" },
    ]);
    expect(diffStat(ops)).toEqual({ added: 2, removed: 1 });
  });
  it("одинаковые тексты — без изменений; длинное неизменное сворачивается", () => {
    expect(diffStat(diffLines("x\ny", "x\ny"))).toEqual({ added: 0, removed: 0 });
    const a = Array.from({ length: 30 }, (_, i) => `l${i}`).join("\n");
    const b = a.replace("l15", "L15");
    const h = diffHunks(diffLines(a, b), 2);
    expect(h[0]).toEqual({ op: "skip", count: 13 });
    expect(h.filter((x) => x.op === "add" || x.op === "del").length).toBe(2);
    expect(h[h.length - 1]).toEqual({ op: "skip", count: 12 });
  });
});

describe("Разметка документов", () => {
  it("заголовки, абзацы, списки, таблицы, код, цитаты", () => {
    const md = "# Заголовок\n\nТекст **жирный**\nпродолжение.\n\n- один\n  - вложенный\n1. первый\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```bash\nls\n```\n\n> цитата";
    const b = parseMarkdown(md);
    expect(b.map((x) => x.type)).toEqual(["h", "p", "list", "list", "table", "code", "quote"]);
    expect(b[1]).toEqual({ type: "p", text: "Текст **жирный** продолжение." });
    expect(b[2]).toEqual({ type: "list", ordered: false, items: [{ text: "один", level: 0 }, { text: "вложенный", level: 1 }] });
    expect(b[4]).toEqual({ type: "table", head: ["A", "B"], rows: [["1", "2"]] });
    expect(b[5]).toEqual({ type: "code", lang: "bash", text: "ls" });
  });
  it("строчная разметка и безопасные ссылки", () => {
    expect(parseInline("см. `cc.mjs` и **важно**")).toEqual([
      { t: "text", v: "см. " },
      { t: "code", v: "cc.mjs" },
      { t: "text", v: " и " },
      { t: "b", c: [{ t: "text", v: "важно" }] },
    ]);
    expect(parseInline("[док](docs/WORKERS.md)")).toEqual([{ t: "a", href: "docs/WORKERS.md", c: [{ t: "text", v: "док" }] }]);
    expect(parseInline("[x](javascript:alert(1))")[0]).toEqual({ t: "text", v: "x" });
    expect(parseInline("snake_case_name остаётся")).toEqual([{ t: "text", v: "snake_case_name остаётся" }]);
  });
});

describe("Ключи", () => {
  it("в реестре есть бот команды и все прежние секреты", () => {
    const paths = KEYS.map((k) => k.path);
    for (const p of ["team.botToken", "notify.telegramBotToken", "otp.sms.authToken", "otp.whatsapp.accessToken", "otp.telegram.gatewayToken", "mail.apiKey", "google.clientSecret", "apple.privateKey"]) expect(paths).toContain(p);
    expect(new Set(paths).size).toBe(paths.length);
  });
  it("значение очищается от пробелов; ключ Apple остаётся многострочным; слишком короткое — отказ", () => {
    expect(cleanKeyValue("mail.apiKey", "  re_abc 123xyz\n")).toBe("re_abc123xyz");
    expect(cleanKeyValue("apple.privateKey", "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n")).toContain("\n");
    expect(cleanKeyValue("mail.apiKey", "short")).toBe(null);
    expect(isTelegramBotToken("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw")).toBe(true);
    expect(isTelegramBotToken("not-a-token")).toBe(false);
  });
});
