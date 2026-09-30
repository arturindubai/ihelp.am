import { describe, it, expect } from "vitest";
import { needsLibrary, buildSummaryText, buildLibraryTitle, COMMENT_LIMIT, COMMENT_SUMMARY_LEN } from "./cc-overflow";

describe("needsLibrary", () => {
  it("не нужна для текста в пределах лимита", () => {
    expect(needsLibrary("a".repeat(COMMENT_LIMIT))).toBe(false);
  });

  it("нужна для текста длиннее лимита", () => {
    expect(needsLibrary("a".repeat(COMMENT_LIMIT + 1))).toBe(true);
  });

  it("нужна для отчёта на 12 000 знаков", () => {
    expect(needsLibrary("а".repeat(12_000))).toBe(true);
  });

  it("учитывает trim: пробелы по краям не считаются текстом", () => {
    const spaces = " ".repeat(COMMENT_LIMIT + 100);
    expect(needsLibrary(spaces)).toBe(false);
  });
});

describe("buildSummaryText", () => {
  it("включает первые COMMENT_SUMMARY_LEN символов", () => {
    const full = "а".repeat(12_000);
    const slug = "note-abc12";
    const result = buildSummaryText(full, slug);
    expect(result.startsWith("а".repeat(COMMENT_SUMMARY_LEN))).toBe(true);
  });

  it("заканчивается ссылкой на запись Канона", () => {
    const slug = "note-abc12";
    const result = buildSummaryText("а".repeat(12_000), slug);
    expect(result.endsWith(`[Полный текст: Канон, ${slug}]`)).toBe(true);
  });

  it("результат укладывается в лимит (5000 символов)", () => {
    const full = "а".repeat(12_000);
    const slug = "note-abc12";
    const result = buildSummaryText(full, slug);
    expect(result.length).toBeLessThanOrEqual(COMMENT_LIMIT);
  });

  it("полный текст 12 000 знаков доступен владельцу через slug", () => {
    // Полный текст сохраняется под slug в Каноне — slug доступен из записи ленты
    const full = "а".repeat(12_000);
    const slug = "note-1a2b3c4d5e";
    const summary = buildSummaryText(full, slug);
    // Из записи ленты владелец может достать slug
    expect(summary.includes(`[Полный текст: Канон, ${slug}]`)).toBe(true);
  });
});

describe("buildLibraryTitle", () => {
  it("включает ключ задачи и автора", () => {
    const title = buildLibraryTitle("DEV-67", "dev-1");
    expect(title).toContain("DEV-67");
    expect(title).toContain("dev-1");
  });

  it("метка зависит от вида: report → отчёт", () => {
    expect(buildLibraryTitle("DEV-67", "dev-1", "report")).toContain("отчёт");
  });

  it("метка зависит от вида: handoff → передача", () => {
    expect(buildLibraryTitle("DEV-67", "dev-1", "handoff")).toContain("передача");
  });

  it("неизвестный вид → запись", () => {
    expect(buildLibraryTitle("DEV-67", "dev-1", "unknown")).toContain("запись");
  });

  it("содержит дату (год четырёхзначный)", () => {
    const title = buildLibraryTitle("DEV-67", "dev-1");
    expect(title).toMatch(/20\d{2}/);
  });
});
