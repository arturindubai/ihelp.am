/** Типы для worker-denials-format.mjs (сам модуль — чистый JavaScript: его запускает Node на сервере без сборки) */

export const DENIALS_MARK: string;
export const DENIALS_MAX_LINES: number;
export const DENIALS_MAX_LEN: number;
export function denialForm(toolName: unknown, toolInput: unknown): string;
export function formatDenials(denials: unknown): string;
