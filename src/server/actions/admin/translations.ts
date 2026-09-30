"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../../db";
import { requireSection } from "../../admin";
import { audit } from "../../audit";
import { invalidateUiCache } from "../../settings";
import ru from "../../../../messages/ru.json";
import en from "../../../../messages/en.json";
import am from "../../../../messages/am.json";

type Tree = { [k: string]: string | Tree };
function flat(obj: Tree, prefix = "", out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else flat(v, key, out);
  }
  return out;
}

const ruFlat = flat(ru as unknown as Tree);
const ruKeys = new Set(Object.keys(ruFlat));
const LANG_DEFAULTS: Record<string, Record<string, string>> = {
  en: flat(en as unknown as Tree),
  am: flat(am as unknown as Tree),
};

/** Извлекает имена плейсхолдеров {name} из строки */
function placeholders(s: string): Set<string> {
  return new Set([...(s.matchAll(/\{(\w+)\}/g))].map((m) => m[1]));
}

/** Массовый импорт переводов из JSON-файла.
 *  Обновляет только ключи, существующие в ru.json.
 *  Пропускает строки, совпадающие с дефолтом файла перевода — чтобы не затенять изменения в коде.
 *  Пропускает строки с недостающими плейсхолдерами (сравнивает с русским оригиналом). */
export async function importTranslationsAction(locale: string, data: unknown) {
  const u = await requireSection("translations");
  const localeResult = z.enum(["en", "am"]).safeParse(locale);
  if (!localeResult.success) return { ok: false as const, error: "locale" };

  if (typeof data !== "object" || data === null || Array.isArray(data))
    return { ok: false as const, error: "format" };

  const flat_data = data as Record<string, unknown>;
  let imported = 0;
  let skipped = 0;
  let placeholderIssues = 0;

  const langDefaults = LANG_DEFAULTS[localeResult.data] ?? {};

  for (const [key, value] of Object.entries(flat_data)) {
    if (!ruKeys.has(key)) { skipped++; continue; }
    if (typeof value !== "string") continue;
    const v = value.trim();
    if (!v) continue;

    // Не перезаписывать, если значение совпадает с дефолтом из файла перевода
    if (v === langDefaults[key]) { skipped++; continue; }

    // Проверить плейсхолдеры: все {x} из ru должны быть в переводе
    const ruP = placeholders(ruFlat[key] || "");
    const vP = placeholders(v);
    if ([...ruP].some((p) => !vP.has(p))) { placeholderIssues++; skipped++; continue; }

    await db.uiString.upsert({
      where: { locale_key: { locale: localeResult.data, key } },
      create: { locale: localeResult.data, key, value: v },
      update: { value: v },
    });
    imported++;
  }

  invalidateUiCache();
  await audit(u.id, "ui.import", "UiString", localeResult.data, { imported, skipped, placeholderIssues });
  revalidatePath("/", "layout");
  return { ok: true as const, imported, skipped, placeholderIssues };
}
