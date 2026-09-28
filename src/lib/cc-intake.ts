/**
 * Вспомогательные функции для работы с входящими Intake (IN-N):
 * парсинг карты просьб, определение дублей, проверка валидности.
 */

const KEY_RE = /\b([A-Z]+-\d+)\b/g;

/** Извлекает все ключи задач из карты просьб */
export function parseClosingMapKeys(map: string): string[] {
  return [...new Set([...map.matchAll(KEY_RE)].map((m) => m[1]))];
}

/**
 * Находит ключ оригинала, если входящая закрыта как дубль.
 * Форматы: «дубль DEV-5», «уже есть AUTH-3» (регистр не важен),
 * а также формат blockedReason из createDuplicateNotice: «…как дубль. Оригинал: KEY title».
 */
export function parseDuplicateOriginalKey(map: string): string | null {
  const match = map.match(/(?:(?:дубль|уже есть)[:\s]+|Оригинал:\s+)([A-Z]+-\d+)/i);
  return match ? match[1] : null;
}

/**
 * Карта просьб считается заполненной, если содержит хотя бы одно слово.
 * Пустая строка или только пробелы — не заполнена.
 */
export function intakeClosingMapValid(map: string): boolean {
  return map.trim().length > 0;
}

/**
 * Разбирает карту просьб на строки. Каждая непустая строка — одно отображение просьбы.
 * Возвращает массив строк без ведущих/ведущих пробелов.
 */
export function parseClosingMapLines(map: string): string[] {
  return map
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
