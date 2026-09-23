/**
 * Проверка и подготовка загружаемых картинок (админка: каталог, мастера, баннеры).
 * Тип определяется по содержимому файла, а не по имени и MIME от браузера — оба подделываются.
 * Принимаются JPEG, PNG, WebP и GIF (у GIF берётся первый кадр); SVG не принимается: в нём можно спрятать скрипт.
 * Файл всегда перекодируется в WebP: это уменьшает вес, убирает EXIF (в фото с телефона там координаты съёмки)
 * и отсекает всё, что только притворяется картинкой.
 */
import sharp from "sharp";

export type ImageKind = "jpeg" | "png" | "webp" | "gif";

/** Размер загружаемого файла. Фото с телефона — 3–10 МБ; выше лимита Caddy для этого пути (deploy/Caddyfile) не поднимать */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
/** Длинная сторона после уменьшения: для баннера на весь экран хватает, для аватарок next/image нарежет меньше */
export const MAX_SIDE = 2000;
/** Защита от «бомбы» (маленький файл, огромная картинка): 50 Мп покрывает камеры телефонов */
const MAX_PIXELS = 50_000_000;
const WEBP_QUALITY = 82;

const ascii = (b: Uint8Array, from: number, text: string) => [...text].every((ch, i) => b[from + i] === ch.charCodeAt(0));

/** Тип картинки по первым байтам файла; null — не картинка из разрешённых */
export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, "PNG") && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 6 && (ascii(b, 0, "GIF87a") || ascii(b, 0, "GIF89a"))) return "gif";
  if (b.length >= 12 && ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) return "webp";
  return null;
}

export type PreparedImage = { ok: true; data: Buffer; width: number; height: number } | { ok: false; error: "type" | "broken" };

/** Готовит файл к сохранению: проверяет сигнатуру, поворачивает по EXIF, уменьшает до MAX_SIDE, кодирует в WebP */
export async function prepareUpload(input: Buffer): Promise<PreparedImage> {
  if (!sniffImage(input)) return { ok: false, error: "type" };
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, data, width: info.width, height: info.height };
  } catch {
    // Заголовок картинки есть, содержимое битое или слишком большое
    return { ok: false, error: "broken" };
  }
}
