import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { amd } from "@/lib/format";
import { Rating } from "./Stars";
import { Img } from "@/components/Img";

export async function ServiceCard({ s }: { s: { slug: string; title: string; subtitle: string; image: string | null; rating: number; reviewsCount: number; fromPrice: number; maxDiscount: number } }) {
  const t = await getTranslations("common");
  return (
    <Link href={`/s/${s.slug}`} className="flex gap-3 py-4">
      <Img src={s.image || "/img/svc-regular.svg"} width={84} className="size-[84px] shrink-0 rounded-xl object-cover" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="h3">{s.title}</h3>
          <ChevronRight size={18} className="mt-0.5 shrink-0 text-muted" />
        </div>
        <Rating value={s.rating} count={s.reviewsCount} label={t("reviews", { count: s.reviewsCount })} />
        {s.subtitle && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{s.subtitle}</p>}
        <div className="mt-1.5 flex items-center gap-2">
          {s.fromPrice > 0 && <span className="chip">{t("from", { price: amd(s.fromPrice) })}</span>}
          {s.maxDiscount > 0 && <span className="chip bg-ok-50 text-ok">{t("off", { percent: s.maxDiscount })}</span>}
        </div>
      </div>
    </Link>
  );
}
