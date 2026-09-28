"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../../db";
import { requireSection } from "../../admin";
import { audit } from "../../audit";
import { invalidateUiCache } from "../../settings";
import ru from "../../../../messages/ru.json";

type Tree = { [k: string]: string | Tree };
function flat(obj: Tree, prefix = "", out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else flat(v, key, out);
  }
  return out;
}

const ruKeys = new Set(Object.keys(flat(ru as unknown as Tree)));

/** Массовый импорт переводов из JSON-файла.
 *  Обновляет только ключи, существующие в ru.json. Лишние ключи игнорируются. */
export async function importTranslationsAction(locale: string, data: unknown) {
  const u = await requireSection("translations");
  const localeResult = z.enum(["en", "am"]).safeParse(locale);
  if (!localeResult.success) return { ok: false as const, error: "locale" };

  if (typeof data !== "object" || data === null || Array.isArray(data))
    return { ok: false as const, error: "format" };

  const flat_data = data as Record<string, unknown>;
  let imported = 0;
  let skipped = 0;

  for (const [key, value] of Object.entries(flat_data)) {
    if (!ruKeys.has(key)) { skipped++; continue; }
    if (typeof value !== "string") continue;
    const v = value.trim();
    if (!v) continue;
    await db.uiString.upsert({
      where: { locale_key: { locale: localeResult.data, key } },
      create: { locale: localeResult.data, key, value: v },
      update: { value: v },
    });
    imported++;
  }

  invalidateUiCache();
  await audit(u.id, "ui.import", "UiString", localeResult.data, { imported, skipped });
  revalidatePath("/", "layout");
  return { ok: true as const, imported, skipped };
}
