import { describe, it, expect } from "vitest";
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
});
