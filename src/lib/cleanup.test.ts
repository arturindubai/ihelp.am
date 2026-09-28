import { describe, expect, it } from "vitest";
import { staleFiles } from "./cleanup";

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
