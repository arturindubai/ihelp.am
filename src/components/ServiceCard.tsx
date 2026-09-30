import { getTranslations, getLocale } from "next-intl/server";
import { ChevronRight, Clock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { amd, durationLabel } from "@/lib/format";
import { RATING_THRESHOLD } from "@/lib/constants";
import { Rating } from "./Stars";
import { Img } from "@/components/Img";

type ServiceCardProps = {
  slug: string;
  title: string;
  subtitle: string;
  image: string | null;
  rating: number;
  reviewsCount: number;
  fromPrice: number;
  maxDiscount: number;
  minDuration: number;
  isNew?: boolean;
  arrivalHours?: number | null;
};

export async function ServiceCard({ s, showInlinePrice }: { s: ServiceCardProps; showInlinePrice?: boolean }) {
  const [t, tc, locale] = await Promise.all([getTranslations("common"), getTranslations("catalog"), getLocale()]);
  const hasRating = s.reviewsCount >= RATING_THRESHOLD;
  const showArrival = s.arrivalHours != null;
  const arrivalText = showArrival
    ? s.arrivalHours! <= 1
      ? tc("arrivalToday")
      : tc("arrivalWithin", { n: s.arrivalHours! })
    : null;
  return (
    <Link href={`/s/${s.slug}`} className="card flex gap-3 p-4 transition hover:bg-surface">
      <div className="relative shrink-0">
        <Img src={s.image || "/img/svc-regular.svg"} width={80} className="size-20 rounded-xl object-cover" />
        {s.isNew && (
          <span className="absolute top-[-4px] right-[-4px] z-10 rounded-[6px] bg-brand px-[6px] py-[2px] text-[10px] font-bold text-inverse">
            {tc("badgeNew")}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="h3 leading-snug">{s.title}</h3>
          <ChevronRight size={18} className="mt-0.5 shrink-0 text-muted" />
        </div>
        {hasRating ? (
          <Rating value={s.rating} count={s.reviewsCount} label={t("reviews", { count: s.reviewsCount })} />
        ) : (
          <span className="mt-0.5 inline-block rounded-full bg-badge px-2 py-0.5 text-xs font-medium text-on-badge">
            {tc("newService")}
          </span>
        )}
        {showArrival && (
          <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-ok">
            <Clock size={12} />
            {arrivalText}
          </div>
        )}
        {s.subtitle && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{s.subtitle}</p>}
        {showInlinePrice && hasRating && (s.fromPrice > 0 || s.rating > 0) && (
          <div className="mt-1 flex items-center gap-2 text-sm">
            {s.fromPrice > 0 && <span className="font-medium text-brand">{t("from", { price: amd(s.fromPrice) })}</span>}
            {s.rating > 0 && <span className="text-muted">⭐ {s.rating.toFixed(1)}</span>}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {s.fromPrice > 0 && !(showInlinePrice && hasRating) && <span className="chip">{t("from", { price: amd(s.fromPrice) })}</span>}
          {s.minDuration > 0 && <span className="chip">{durationLabel(s.minDuration, locale)}</span>}
          {s.maxDiscount > 0 && <span className="chip bg-warn-50 text-warn">{t("off", { percent: s.maxDiscount })}</span>}
        </div>
      </div>
    </Link>
  );
}
