export type SectionGroup<T> = {
  sectionId: string | null;
  sectionTitle: string | null;
  items: T[];
};

export type SectionMeta = { id: string; title: string; sort: number };

/**
 * Группирует элементы по разделам в порядке сортировки разделов.
 * Элементы без раздела идут последними, без заголовка.
 * По умолчанию пустые разделы пропускаются.
 */
export function groupBySection<T extends { sectionId?: string | null }>(
  items: T[],
  sections: SectionMeta[],
  options?: { includeEmpty?: boolean },
): SectionGroup<T>[] {
  const sorted = [...sections].sort((a, b) => a.sort - b.sort);
  const buckets = new Map<string | null, T[]>();

  for (const s of sorted) buckets.set(s.id, []);
  buckets.set(null, []);

  for (const item of items) {
    const key = item.sectionId ?? null;
    const target = buckets.has(key) ? key : null;
    buckets.get(target)!.push(item);
  }

  const result: SectionGroup<T>[] = [];
  for (const [sectionId, list] of buckets) {
    if (!options?.includeEmpty && list.length === 0) continue;
    const meta = sectionId ? sections.find((s) => s.id === sectionId) : undefined;
    result.push({ sectionId, sectionTitle: meta?.title ?? null, items: list });
  }
  return result;
}
