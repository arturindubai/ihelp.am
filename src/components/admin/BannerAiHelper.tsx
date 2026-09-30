"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, ImagePlus, Loader2, X } from "lucide-react";
import { suggestBannerTitleAction, generateBannerImageAction, type TitleVariant } from "@/server/actions/admin/bannerAi";
import type { I18n } from "./fields";
import { Img } from "@/components/Img";

type Props = {
  hasAnthropicKey: boolean;
  hasHiggsfieldKey: boolean;
  initialUsageCount: number;
  bannerTitle: I18n;
  bannerPlacement: string;
  onApplyTitle: (title: I18n, subtitle: I18n) => void;
  onApplyImage: (url: string) => void;
};

export function BannerAiHelper({
  hasAnthropicKey,
  hasHiggsfieldKey,
  initialUsageCount,
  bannerTitle,
  bannerPlacement,
  onApplyTitle,
  onApplyImage,
}: Props) {
  const t = useTranslations("admin.banners");
  const [titleVariants, setTitleVariants] = useState<TitleVariant[] | null>(null);
  const [imageUrls, setImageUrls] = useState<string[] | null>(null);
  const [error, setError] = useState<"title" | "image" | null>(null);
  const [usageCount, setUsageCount] = useState(initialUsageCount);
  const [titlePending, startTitle] = useTransition();
  const [imagePending, startImage] = useTransition();

  const anyPending = titlePending || imagePending;

  if (!hasAnthropicKey && !hasHiggsfieldKey) return null;

  const handleSuggestTitle = () =>
    startTitle(async () => {
      setError(null);
      setTitleVariants(null);
      const context = [bannerTitle.ru || "", `placement: ${bannerPlacement}`].filter(Boolean).join(", ");
      const r = await suggestBannerTitleAction(context);
      if (!r.ok) {
        setError("title");
        return;
      }
      setTitleVariants(r.variants);
      setUsageCount(r.usageCount);
    });

  const handleGenerateImage = () =>
    startImage(async () => {
      setError(null);
      setImageUrls(null);
      const prompt = bannerTitle.ru || bannerPlacement;
      const r = await generateBannerImageAction(prompt);
      if (!r.ok) {
        setError("image");
        return;
      }
      setImageUrls(r.urls);
      setUsageCount(r.usageCount);
    });

  const handleApplyTitle = (v: TitleVariant) => {
    onApplyTitle(v.title, v.subtitle);
    setTitleVariants(null);
  };

  const handleApplyImage = (url: string) => {
    onApplyImage(url);
    setImageUrls(null);
  };

  return (
    <div className="space-y-2">
      {/* Кнопки-помощники */}
      <div className="flex gap-2">
        {hasAnthropicKey && (
          <button
            type="button"
            className="btn-outline btn-sm flex flex-1 items-center justify-center gap-1.5 overflow-hidden"
            disabled={anyPending}
            onClick={handleSuggestTitle}
          >
            {titlePending ? (
              <Loader2 size={16} className="shrink-0 animate-spin text-brand" />
            ) : (
              <Sparkles size={16} className="shrink-0 text-brand" />
            )}
            <span className="truncate">{t("aiSuggestTitle")}</span>
          </button>
        )}
        {hasHiggsfieldKey && (
          <button
            type="button"
            className="btn-outline btn-sm flex flex-1 items-center justify-center gap-1.5 overflow-hidden"
            disabled={anyPending}
            onClick={handleGenerateImage}
          >
            {imagePending ? (
              <Loader2 size={16} className="shrink-0 animate-spin text-brand" />
            ) : (
              <ImagePlus size={16} className="shrink-0 text-brand" />
            )}
            <span className="truncate">{t("aiGenerateImage")}</span>
          </button>
        )}
      </div>

      {/* Счётчик обращений */}
      <p className="text-xs text-muted">{t("aiUsageCount", { count: usageCount })}</p>

      {/* Ошибка */}
      {error && <p className="text-sm text-bad">{t("aiError")}</p>}

      {/* Варианты заголовка */}
      {titleVariants && (
        <div className="card mt-2 space-y-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-ink">{t("aiSuggestResults")}</span>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setTitleVariants(null)}
              aria-label="Закрыть"
            >
              <X size={14} />
            </button>
          </div>
          <ul className="space-y-2">
            {titleVariants.map((v, i) => (
              <li key={i} className="select-card cursor-pointer break-words" data-on="false">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {(["ru", "en", "am"] as const).map((lang) =>
                      v.title[lang] ? (
                        <div key={lang} className="line-clamp-2">
                          <span className="chip mr-1 text-[10px]">{lang}</span>
                          <span className="text-sm text-ink">{v.title[lang]}</span>
                          {v.subtitle[lang] && (
                            <span className="ml-1 text-xs text-muted">— {v.subtitle[lang]}</span>
                          )}
                        </div>
                      ) : null,
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-outline btn-sm shrink-0"
                    onClick={() => handleApplyTitle(v)}
                  >
                    {t("aiApply")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Варианты изображений */}
      {imageUrls && (
        <div className="card mt-2 space-y-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-ink">{t("aiImageResults")}</span>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setImageUrls(null)}
              aria-label="Закрыть"
            >
              <X size={14} />
            </button>
          </div>
          <ul className="space-y-3">
            {imageUrls.map((url, i) => (
              <li key={i}>
                <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-line bg-surface">
                  <Img src={url} width={640} className="h-full w-full object-cover" />
                </div>
                <button
                  type="button"
                  className="btn-outline btn-sm mt-2 w-full"
                  onClick={() => handleApplyImage(url)}
                >
                  {t("aiUse")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
