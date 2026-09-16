import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db";
import { pageUser } from "@/server/adminPage";
import { tr } from "@/i18n/locales";
import { formatPhone } from "@/lib/phone";
import { PageHead, Forbidden } from "@/components/admin/ui";

export default async function AdminMasters({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await pageUser("masters"))) return <Forbidden />;
  const t = await getTranslations("admin");
  const masters = await db.master.findMany({ orderBy: [{ active: "desc" }, { sort: "asc" }], include: { skills: true } });
  return (
    <div className="max-w-4xl">
      <PageHead title={t("masters.title")} actions={<Link href="/admin/masters/new" className="btn-dark"><Plus size={18} /> {t("masters.newMaster")}</Link>} />
      <div className="grid gap-2 sm:grid-cols-2">
        {masters.map((m) => (
          <Link key={m.id} href={`/admin/masters/${m.id}`} className={`card flex items-center gap-3 p-3 ${m.active ? "" : "opacity-60"}`}>
            <img src={m.photo || "/img/master-1.svg"} alt="" className="size-14 rounded-full object-cover" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{tr(m.name, locale)} {!m.active && <span className="chip">{t("common.archived")}</span>}</div>
              <div className="text-xs text-muted">{m.reviewsCount ? `★ ${m.rating.toFixed(1)} (${m.reviewsCount})` : "—"} · {t("masters.jobs")}: {m.jobsCount}</div>
              <div className="truncate text-xs text-muted">{m.phone ? formatPhone(m.phone) : ""} {m.userId ? `· ✓ ${t("masters.linked")}` : ""}</div>
              <div className="truncate text-xs text-muted">{m.skills.map((s) => tr(s.title, locale)).join(", ")}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
