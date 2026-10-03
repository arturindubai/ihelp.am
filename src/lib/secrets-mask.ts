/**
 * Маскирование секретов в тексте перед сохранением в ленту задачи и сообщения.
 * Заменяет строки, похожие на токены и ключи, на «[скрыто: секрет]».
 * Обычные числа, хэши коммитов и короткие идентификаторы не затрагиваются.
 */

export const SECRET_MASK = "[скрыто: секрет]";

/** Хэш коммита: только hex-символы, 7–40 знаков — не секрет */
const COMMIT_SHA_RE = /^[0-9a-f]{7,40}$/i;

function looksLikeCommitSha(s: string): boolean {
  return COMMIT_SHA_RE.test(s);
}

/**
 * Паттерны для прямого совпадения: токены Telegram, ключи с известными префиксами.
 * Каждый вызов возвращает новые экземпляры RegExp (lastIndex не сохраняется между вызовами).
 */
function buildPatterns(): RegExp[] {
  return [
    // Токен Telegram-бота: числа:буквы35+  (5284978512:AAGx4...)
    /\b\d{5,15}:[A-Za-z0-9_-]{30,50}/g,
    // API-ключи с известными префиксами (Stripe sk_, Resend re_, GitHub ghp_ и т.д.)
    /\b(?:sk|re|ghp|gho|ghu|ghs|ghr|pk)_[A-Za-z0-9_-]{20,}/g,
    // AWS AccessKeyId
    /\bAKIA[A-Za-z0-9]{16}\b/g,
    // Slack-токены
    /\bxox[bposa]-[A-Za-z0-9-]{40,}/g,
  ];
}

/** Результат маскирования */
export type MaskResult = { masked: string; found: boolean };

/**
 * Маскирует секреты в строке.
 * Возвращает изменённую строку и флаг: был ли найден хотя бы один секрет.
 */
export function maskSecrets(text: string): MaskResult {
  let masked = text;
  let found = false;

  for (const re of buildPatterns()) {
    const next = masked.replace(re, SECRET_MASK);
    if (next !== masked) { found = true; masked = next; }
  }

  // Ключевые слова: длинные значения после token/key/secret/password, не похожие на хэш коммита
  const kwRe = /\b(?:token|key|secret|password|api[_-]?key|auth[_-]?key)\s*[=:]\s*["']?([A-Za-z0-9/+_.\-]{20,})["']?/gi;
  const nextKw = masked.replace(kwRe, (match, capture: string) => {
    if (looksLikeCommitSha(capture)) return match;
    found = true;
    return match.replace(capture, SECRET_MASK);
  });
  if (nextKw !== masked) masked = nextKw;

  return { masked, found };
}
