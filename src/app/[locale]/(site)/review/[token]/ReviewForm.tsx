"use client";
import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { reviewByTokenAction } from "@/server/actions/account";

const TIP_PRESETS = [500, 1000, 1500];

interface ReviewFormProps {
  token: string;
  masterName: string;
  masterPhoto: string | null;
  serviceTitle: string;
  visitDateLabel: string;
  serviceSlug: string;
  orderId: string;
}

export function ReviewForm({ token, masterName, masterPhoto, serviceTitle, visitDateLabel, serviceSlug, orderId }: ReviewFormProps) {
  const t = useTranslations("review");
  const tc = useTranslations("common");
  const ratingLabels = t("ratingLabels").split(",");

  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  // -1 = без чаевых, 0..2 = пресет, 3 = своя
  const [tipPreset, setTipPreset] = useState<-1 | 0 | 1 | 2 | 3>(-1);
  const [customTip, setCustomTip] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  const isCustom = tipPreset === 3;
  const tipAmount = tipPreset < 0 ? 0 : tipPreset < 3 ? TIP_PRESETS[tipPreset] : (parseInt(customTip) || 0);

  const masterInitial = masterName ? masterName.charAt(0).toUpperCase() : "i";

  if (done) {
    return (
      <div className="flex flex-col items-center pt-8 text-center">
        <div className="text-5xl">★</div>
        <p className="mt-4 text-lg font-semibold">{t("thanks")}</p>
        <p className="mt-1 text-sm text-muted">{t("thanksSub")}</p>
        <Link href={`/book/${serviceSlug}?reorder=${orderId}`} className="btn-primary mt-6 flex w-full items-center justify-center">
          {t("bookAgain")}
        </Link>
        <Link href="/" className="btn-outline mt-2 flex w-full items-center justify-center">
          {t("toHome")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Карточка мастера */}
      <div className="flex items-center gap-3 rounded-xl bg-surface p-3">
        {masterPhoto ? (
          <img src={masterPhoto} alt="" className="size-12 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-text">
            {masterInitial}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-xs text-muted">{t("masterLabel")}</div>
          <div className="truncate font-semibold">{masterName}</div>
          {(serviceTitle || visitDateLabel) && (
            <div className="truncate text-sm text-muted">
              {[serviceTitle, visitDateLabel].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      </div>

      {/* Звёзды */}
      <div>
        <div className="mb-2 flex justify-center gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              onClick={() => setRating(i)}
              aria-label={`${i}`}
              className="size-12 cursor-pointer transition"
            >
              <Star size={48} className={i <= rating ? "fill-brand stroke-brand" : "stroke-line"} />
            </button>
          ))}
        </div>
        <p className="h-5 text-center text-sm text-muted">
          {rating > 0 ? ratingLabels[rating - 1] : ""}
        </p>
      </div>

      {/* Комментарий */}
      <textarea
        className="input min-h-28 w-full py-2"
        placeholder={t("placeholder")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      {/* Чаевые */}
      <div className="mt-4">
        <p className="mb-2 text-sm font-medium">{t("tips")}</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTipPreset(-1)}
            className={`rounded-full border px-3 py-1 text-sm transition ${tipPreset === -1 ? "border-action bg-brand-50 text-brand" : "border-line"}`}
          >
            {t("noTip")}
          </button>
          {TIP_PRESETS.map((amount, i) => (
            <button
              key={amount}
              onClick={() => setTipPreset(i as 0 | 1 | 2)}
              className={`rounded-full border px-3 py-1 text-sm transition ${tipPreset === i ? "border-action bg-brand-50 text-brand" : "border-line"}`}
            >
              {amount.toLocaleString("ru-RU")} ֏
            </button>
          ))}
          <button
            onClick={() => setTipPreset(3)}
            className={`rounded-full border px-3 py-1 text-sm transition ${isCustom ? "border-action bg-brand-50 text-brand" : "border-line"}`}
          >
            {t("customTip")}
          </button>
        </div>
        {isCustom && (
          <input
            type="number"
            min={0}
            className="input mt-2 w-full"
            placeholder="0 ֏"
            value={customTip}
            onChange={(e) => setCustomTip(e.target.value)}
          />
        )}
        <p className="mt-1 text-xs text-muted">{t("tipsHint")}</p>
      </div>

      {err && <p className="text-sm text-bad">{err}</p>}

      <button
        className="btn-primary w-full"
        disabled={pending || rating === 0}
        onClick={() =>
          start(async () => {
            const r = await reviewByTokenAction(token, rating, text, tipAmount);
            if (r.ok) {
              setDone(true);
            } else {
              setErr(tc("error"));
            }
          })
        }
      >
        {t("send")}
      </button>
    </div>
  );
}
