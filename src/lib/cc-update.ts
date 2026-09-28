/**
 * Логика построения патча для команды update — вынесена для тестирования.
 * Источники полей: JSON (--file / --data) и текстовые файлы (--design-file, --details-file, --summary-file).
 */

/** Поля задачи, которые можно менять через команду update */
export const UPDATE_FIELDS = [
  "title", "summary", "details", "requirements", "design",
  "qaNotes", "deployNotes", "needs", "depends", "docs",
  "epicKey", "area", "layer", "priority", "stage", "owner",
  "estimate", "scope", "mockupRequired", "mockupUrl",
] as const;

export type UpdateField = (typeof UPDATE_FIELDS)[number];

/** Соответствие: поле → флаг командной строки */
export const TEXT_FILE_FLAGS: Record<string, string> = {
  design: "--design-file",
  details: "--details-file",
  summary: "--summary-file",
};

export type TextFilePatch = {
  design?: string;
  details?: string;
  summary?: string;
};

export type BuildUpdatePatchResult = {
  patch: Record<string, unknown>;
  error?: string;
};

/**
 * Строит патч задачи из JSON-полей и/или текстовых полей из файлов.
 * Текстовые поля (textFiles) перекрывают одноимённые поля из jsonPatch.
 * Возвращает error, если патч не содержит ни одного допустимого поля.
 */
export function buildUpdatePatch(opts: {
  jsonPatch?: Record<string, unknown>;
  textFiles?: TextFilePatch;
}): BuildUpdatePatchResult {
  const patch: Record<string, unknown> = { ...(opts.jsonPatch ?? {}) };
  const { textFiles = {} } = opts;

  if (textFiles.design !== undefined) patch.design = textFiles.design;
  if (textFiles.details !== undefined) patch.details = textFiles.details;
  if (textFiles.summary !== undefined) patch.summary = textFiles.summary;

  const hasField = Object.keys(patch).some((k) => (UPDATE_FIELDS as readonly string[]).includes(k));
  if (!hasField) {
    return {
      patch,
      error: `нет полей для обновления; допустимые поля: ${UPDATE_FIELDS.join(", ")}`,
    };
  }

  return { patch };
}

/** Форматирует список изменённых полей и их объём для вывода после update */
export function formatChangedFields(patch: Record<string, unknown>): string {
  const parts = Object.entries(patch)
    .filter(([k]) => (UPDATE_FIELDS as readonly string[]).includes(k))
    .map(([k, v]) => {
      if (typeof v === "string") return `${k} (${v.length} симв.)`;
      if (Array.isArray(v)) return `${k} (${(v as unknown[]).length} эл.)`;
      return k;
    });
  return parts.length > 0 ? parts.join(", ") : "(нет полей)";
}
