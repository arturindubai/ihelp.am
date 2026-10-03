import { describe, expect, it } from "vitest";
import { staleFiles, extractUploadUrls } from "./cleanup";

const ago = (days: number) => new Date(Date.now() - days * 24 * 3600_000);
const cutoff = ago(7);

describe("staleFiles", () => {
  it("оставляет файл, на который есть ссылка в базе", () => {
    const used = new Set(["/uploads/2026-09/abc.webp"]);
    const files = [{ url: "/uploads/2026-09/abc.webp", path: "/data/abc.webp", mtime: ago(10) }];
    expect(staleFiles(used, files, cutoff)).toHaveLength(0);
  });

  it("оставляет файл без ссылки, но моложе 7 дней", () => {
    const files = [{ url: "/uploads/2026-09/new.webp", path: "/data/new.webp", mtime: ago(3) }];
    expect(staleFiles(new Set(), files, cutoff)).toHaveLength(0);
  });

  it("возвращает файл без ссылки старше 7 дней", () => {
    const files = [{ url: "/uploads/2026-09/old.webp", path: "/data/old.webp", mtime: ago(8) }];
    const result = staleFiles(new Set(), files, cutoff);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("/data/old.webp");
  });

  it("граница: файл ровно 7 дней назад не удаляется", () => {
    const files = [{ url: "/uploads/2026-09/edge.webp", path: "/data/edge.webp", mtime: cutoff }];
    expect(staleFiles(new Set(), files, cutoff)).toHaveLength(0);
  });

  it("смешанный список: удаляет только устаревшие без ссылок", () => {
    const used = new Set(["/uploads/2026-09/used.webp"]);
    const files = [
      { url: "/uploads/2026-09/used.webp", path: "/data/used.webp", mtime: ago(10) },
      { url: "/uploads/2026-09/new.webp", path: "/data/new.webp", mtime: ago(3) },
      { url: "/uploads/2026-09/old.webp", path: "/data/old.webp", mtime: ago(8) },
    ];
    const result = staleFiles(used, files, cutoff);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("/uploads/2026-09/old.webp");
  });

  it("пустые входные данные — пустой результат", () => {
    expect(staleFiles(new Set(), [], cutoff)).toHaveLength(0);
  });
});

describe("extractUploadUrls", () => {
  it("извлекает URL из строки", () => {
    const result = extractUploadUrls("/uploads/2026-09/abc.webp");
    expect(result).toEqual(["/uploads/2026-09/abc.webp"]);
  });

  it("извлекает URL из JSON-объекта", () => {
    const body = { ru: "Текст с картинкой /uploads/2026-09/img.webp", en: "Text" };
    const result = extractUploadUrls(body);
    expect(result).toEqual(["/uploads/2026-09/img.webp"]);
  });

  it("возвращает уникальные URL (дубли убраны)", () => {
    const text = "/uploads/2026-09/a.webp и снова /uploads/2026-09/a.webp";
    expect(extractUploadUrls(text)).toHaveLength(1);
  });

  it("возвращает пустой массив для null и undefined", () => {
    expect(extractUploadUrls(null)).toHaveLength(0);
    expect(extractUploadUrls(undefined)).toHaveLength(0);
    expect(extractUploadUrls("")).toHaveLength(0);
  });

  it("извлекает несколько URL из одного текста", () => {
    const text = "img1: /uploads/2026-09/a.webp img2: /uploads/2026-10/b.png";
    const result = extractUploadUrls(text);
    expect(result).toHaveLength(2);
    expect(result).toContain("/uploads/2026-09/a.webp");
    expect(result).toContain("/uploads/2026-10/b.png");
  });

  it("не возвращает /uploads/_trash/... (пути в корзине)", () => {
    const text = "/uploads/_trash/2026-10-01/2026-09/a.webp";
    const result = extractUploadUrls(text);
    expect(result).toEqual(["/uploads/_trash/2026-10-01/2026-09/a.webp"]);
  });

  it("вложенный JSON с несколькими уровнями", () => {
    const json = { blocks: [{ type: "image", url: "/uploads/2026-09/hero.webp" }] };
    const result = extractUploadUrls(json);
    expect(result).toContain("/uploads/2026-09/hero.webp");
  });
});
