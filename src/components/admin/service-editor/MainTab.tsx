"use client";
import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Plus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/format";
import { Card, I18nInput, ImageInput, NumInput, Toggle } from "@/components/admin/fields";
import { MastersBlock, type MasterInfo } from "./MastersBlock";
import type { ServicePayload } from "@/server/actions/admin/catalog";

function slugify(text: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return text.toLowerCase()
    .split("").map((c) => map[c] ?? c).join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "service";
}

export function MainTab({
  s,
  up,
  categories,
  masters,
  onCreateCategory,
}: {
  s: ServicePayload;
  up: (patch: Partial<ServicePayload>) => void;
  categories: { id: string; title: string }[];
  masters: MasterInfo[];
  onCreateCategory: () => void;
}) {
  const t = useTranslations("admin");
  const isAutoSlug = !s.slug || s.slug.startsWith("service-");
  const [autoSlug, setAutoSlug] = useState(isAutoSlug);

  const handleTitleChange = useCallback(
    (v: { ru?: string; en?: string; am?: string }) => {
      up({ title: v });
      if (autoSlug && v.ru) up({ slug: slugify(v.ru) });
    },
    [autoSlug, up],
  );

  return (
    <div className="space-y-4">
      {/* Текстовые поля */}
      <Card>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <I18nInput label={t("common.title")} required value={s.title} onChange={handleTitleChange} />
          </div>
          <div className="md:col-span-2">
            <I18nInput label={t("common.subtitle")} value={s.subtitle} onChange={(v) => up({ subtitle: v })} />
          </div>
          <div className="md:col-span-2">
            <I18nInput label={t("common.description")} multiline value={s.description} onChange={(v) => up({ description: v })} />
          </div>
          <div className="md:col-span-2">
            <I18nInput
              label={t("services.includesText")}
              multiline
              placeholder={t("services.includesExcludesPlaceholder")}
              value={s.includesText}
              onChange={(v) => up({ includesText: v })}
            />
          </div>
          <div className="md:col-span-2">
            <I18nInput
              label={t("services.excludesText")}
              multiline
              placeholder={t("services.includesExcludesPlaceholder")}
              value={s.excludesText}
              onChange={(v) => up({ excludesText: v })}
            />
          </div>
        </div>
      </Card>

      {/* Slug, категория, порядок, активность */}
      <Card>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">{t("common.slug")}</label>
            <div className="flex gap-1.5">
              <input
                className="input flex-1 font-mono text-sm"
                value={s.slug}
                placeholder="service-slug"
                onChange={(e) => { setAutoSlug(false); up({ slug: e.target.value }); }}
              />
              <button
                type="button"
                title={t("services.slugFromTitle")}
                onClick={() => {
                  setAutoSlug(true);
                  if (s.title?.ru) up({ slug: slugify(s.title.ru) });
                }}
                className={cn("btn-ghost btn-sm px-2 shrink-0", autoSlug && "text-brand")}
              >
                <RefreshCw size={15} />
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">{t("common.slugHint")}</p>
          </div>

          <div>
            <label className="label">{t("services.category")}</label>
            <div className="flex gap-1.5">
              <select
                className="input flex-1"
                value={s.categoryId}
                onChange={(e) => up({ categoryId: e.target.value })}
              >
                {categories.map((x) => (
                  <option key={x.id} value={x.id}>{x.title}</option>
                ))}
              </select>
              <button
                type="button"
                title={t("services.addCategory")}
                onClick={onCreateCategory}
                className="btn-ghost btn-sm px-2 shrink-0"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

          <NumInput label={t("common.sort")} value={s.sort} onChange={(v) => up({ sort: v ?? 0 })} />
          <div className="pt-6">
            <Toggle label={t("common.active")} checked={s.active} onChange={(v) => up({ active: v })} />
          </div>
          <div className="pt-6">
            <Toggle label={t("services.isNew")} checked={s.isNew ?? false} onChange={(v) => up({ isNew: v })} />
          </div>
          <NumInput label={t("services.arrivalHours")} value={s.arrivalHours ?? null} onChange={(v) => up({ arrivalHours: v ?? null })} />
        </div>
      </Card>

      {/* Изображения */}
      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <ImageInput label={t("common.image")} value={s.image} onChange={(v) => up({ image: v })} />
          <ImageInput label={t("services.banner")} value={s.bannerImage} onChange={(v) => up({ bannerImage: v })} />
        </div>
      </Card>

      {/* Мастера */}
      <MastersBlock s={s} up={up} masters={masters} />
    </div>
  );
}
