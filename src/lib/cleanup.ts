/** Возвращает файлы из списка, на которые нет ссылки в базе и которые старше cutoff */
export function staleFiles(
  usedUrls: Set<string>,
  files: { url: string; path: string; mtime: Date }[],
  cutoff: Date,
): { url: string; path: string }[] {
  return files.filter((f) => !usedUrls.has(f.url) && f.mtime < cutoff);
}

/** Извлекает уникальные пути /uploads/... из произвольного JSON-значения или строки */
export function extractUploadUrls(value: unknown): string[] {
  if (!value) return [];
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const result = new Set<string>();
  for (const m of text.matchAll(/\/uploads\/[a-zA-Z0-9_./-]+/g)) {
    result.add(m[0]);
  }
  return [...result];
}
