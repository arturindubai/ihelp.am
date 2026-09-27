import { getTranslations, getLocale } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { amd, durationLabel } from "@/lib/format";
import { Rating } from "./Stars";
import { Img } from "@/components/Img";

// Рейтинг показываем только при наличии достаточного числа отзывов
const RATING_THRESHOLD = 3;

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
};

export async function ServiceCard({ s }: { s: ServiceCardProps }) {
  const [t, tc, locale] = await Promise.all([getTranslations("common"), getTranslations("catalog"), getLocale()]);
  const hasRating = s.reviewsCount >= RATING_THRESHOLD;
  return (
    <Link href={`/s/${s.slug}`} className="card flex gap-3 p-4 transition hover:bg-surface">
      <Img src={s.image || "/img/svc-regular.svg"} width={80} className="size-20 shrink-0 rounded-xl object-cover" />
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
        {s.subtitle && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{s.subtitle}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {s.fromPrice > 0 && <span className="chip">{t("from", { price: amd(s.fromPrice) })}</span>}
          {s.minDuration > 0 && <span className="chip">{durationLabel(s.minDuration, locale)}</span>}
          {s.maxDiscount > 0 && <span className="chip bg-warn-50 text-warn">{t("off", { percent: s.maxDiscount })}</span>}
        </div>
      </div>
    </Link>
  );
}
