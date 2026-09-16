import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db";
import { pageUser } from "@/server/adminPage";
import { tr } from "@/i18n/locales";
import { dateLabel, cn } from "@/lib/format";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { ReviewRow, ReviewCreate } from "@/components/admin/ReviewControls";

export default async function AdminReviews({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ status?: string }> }) {
  const { locale } = await params;
  const { status = "PENDING" } = await searchParams;
  if (!(await pageUser("reviews"))) return <Forbidden />;
  const t = await getTranslations("admin");
  const st = ["PENDING", "APPROVED", "REJECTED"].includes(status) ? (status as "PENDING") : "PENDING";
  const [reviews, counts, masters, services] = await Promise.all([
    db.review.findMany({ where: { status: st }, orderBy: { createdAt: "desc" }, take: 100, include: { master: true, service: true, visit: { include: { order: true } } } }),
    db.review.groupBy({ by: ["status"], _count: true }),
    db.master.findMany({ orderBy: { sort: "asc" } }),
    db.service.findMany({ orderBy: { sort: "asc" } }),
  ]);
  return (
    <div className="max-w-3xl">
      <PageHead title={t("reviews.title")} actions={<ReviewCreate masters={masters.map((m) => ({ id: m.id, name: tr(m.name, locale) }))} services={services.map((s) => ({ id: s.id, name: tr(s.title, locale) }))} />} />
      <div className="mb-4 flex gap-1 rounded-xl bg-paper p-1">
        {(["PENDING", "APPROVED", "REJECTED"] as const).map((s) => <Link key={s} href={`/admin/reviews?status=${s}`} className={cn("flex-1 rounded-lg py-2 text-center text-sm font-medium", st === s ? "bg-ink text-inverse" : "text-muted")}>{t(`reviews.tabs.${s}`)} ({counts.find((c) => c.status === s)?._count || 0})</Link>)}
      </div>
      <ul className="space-y-2">
        {reviews.map((r) => (
          <ReviewRow key={r.id} review={{ id: r.id, rating: r.rating, text: r.text || "", reply: r.reply || "", status: r.status, author: r.authorName || "—", meta: [dateLabel(r.createdAt, locale, { day: "numeric", month: "short", year: "numeric" }), r.master && tr(r.master.name, locale), r.service && tr(r.service.title, locale), r.visit && `№${r.visit.order.number}`].filter(Boolean).join(" · ") }} />
        ))}
      </ul>
      {!reviews.length && <p className="card p-8 text-center text-muted">{t("common.empty")}</p>}
    </div>
  );
}
