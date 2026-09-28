import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { pageUser } from "@/server/adminPage";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { TranslationsEditor } from "@/components/admin/TranslationsEditor";
import ru from "../../../../../messages/ru.json";
import en from "../../../../../messages/en.json";
import am from "../../../../../messages/am.json";

type Tree = { [k: string]: string | Tree };
function flat(obj: Tree, prefix = "", out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else flat(v, key, out);
  }
  return out;
}

/** Считает количество вхождений html` в серверных файлах (сообщения команде через Telegram) */
function countTelegramTemplates(): number {
  const ROOT = process.cwd();
  const serverDir = join(ROOT, "src", "server");
  let count = 0;
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        const content = readFileSync(full, "utf-8");
        const matches = content.match(/html`/g);
        if (matches) count += matches.length;
      }
    }
  }
  walk(serverDir);
  return count;
}

export default async function AdminTranslations() {
  if (!(await pageUser("translations"))) return <Forbidden />;
  const t = await getTranslations("admin");
  const overrides = await db.uiString.findMany();
  const base = { ru: flat(ru as unknown as Tree), en: flat(en as unknown as Tree), am: flat(am as unknown as Tree) };
  const ov: Record<string, Record<string, string>> = { ru: {}, en: {}, am: {} };
  for (const o of overrides) ov[o.locale][o.key] = o.value;
  const rows = Object.keys(base.ru).map((key) => ({ key, def: { ru: base.ru[key], en: base.en[key] || "", am: base.am[key] || "" }, ov: { ru: ov.ru[key] || "", en: ov.en[key] || "", am: ov.am[key] || "" } }));

  const telegramCount = countTelegramTemplates();

  const ruKeys = Object.keys(base.ru);
  const reportStats = {
    ru: { total: ruKeys.length, missing: 0, missingKeys: [] as string[] },
    en: { total: ruKeys.length, missing: 0, missingKeys: [] as string[] },
    am: { total: ruKeys.length, missing: 0, missingKeys: [] as string[] },
  };
  for (const key of ruKeys) {
    if (!base.en[key] && !ov.en[key]) { reportStats.en.missing++; reportStats.en.missingKeys.push(key); }
    if (!base.am[key] && !ov.am[key]) { reportStats.am.missing++; reportStats.am.missingKeys.push(key); }
  }

  return (
    <div className="max-w-5xl">
      <PageHead title={t("translations.title")} sub={t("translations.hint")} />
      <TranslationsEditor rows={rows} reportStats={reportStats} telegramCount={telegramCount} />
    </div>
  );
}
