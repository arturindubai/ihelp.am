import { getTranslations } from "next-intl/server";

type ReviewItem = {
  id: string;
  authorName: string | null;
  rating: number;
  text: string | null;
  serviceTitle: string | null;
};

export async function ReviewsSection({ reviews }: { reviews: ReviewItem[] }) {
  if (!reviews.length) return null;
  const t = await getTranslations("home");
  return (
    <section className="mt-6">
      <h2 className="h2 mb-3">{t("reviewsTitle")}</h2>
      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4">
        {reviews.map((r) => (
          <div key={r.id} className="card w-[280px] shrink-0 snap-start p-4">
            <div className="text-sm font-semibold">{r.authorName || "—"}</div>
            <div className="mt-0.5 flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={i < r.rating ? "text-brand" : "text-line"} aria-hidden>
                  ★
                </span>
              ))}
              <span className="ml-1 text-xs text-muted">{r.rating}.0</span>
            </div>
            {r.text && <p className="mt-2 line-clamp-3 text-sm text-muted">{r.text}</p>}
            {r.serviceTitle && (
              <div className="mt-2">
                <span className="chip">{r.serviceTitle}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
