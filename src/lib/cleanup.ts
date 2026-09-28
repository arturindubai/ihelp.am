/** Возвращает файлы из списка, на которые нет ссылки в базе и которые старше cutoff */
export function staleFiles(
  usedUrls: Set<string>,
  files: { url: string; path: string; mtime: Date }[],
  cutoff: Date,
): { url: string; path: string }[] {
  return files.filter((f) => !usedUrls.has(f.url) && f.mtime < cutoff);
}
