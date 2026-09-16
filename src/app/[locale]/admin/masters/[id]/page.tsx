import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { pageUser } from "@/server/adminPage";
import { tr } from "@/i18n/locales";
import { ymd } from "@/lib/time";
import { Forbidden } from "@/components/admin/ui";
import { MasterEditor } from "@/components/admin/MasterEditor";
import type { MasterPayload } from "@/server/actions/admin/masters";

const DEFAULT_HOURS = Object.fromEntries([1, 2, 3, 4, 5, 6].map((d) => [String(d), [["09:00", "19:00"]]])) as MasterPayload["workingHours"];

export default async function EditMaster({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await pageUser("masters"))) return <Forbidden />;
  const services = await db.service.findMany({ orderBy: { sort: "asc" } });
  const sv = services.map((s) => ({ id: s.id, title: tr(s.title, locale) }));
  if (id === "new") {
    const init: MasterPayload = { slug: "", name: {}, bio: {}, photo: null, phone: "", experienceYears: 0, languages: ["hy", "ru"], workingHours: DEFAULT_HOURS, active: true, sort: 0, skills: services.map((s) => s.id), timeOff: [] };
    return <MasterEditor id={null} initial={init} services={sv} stats={null} />;
  }
  const m = await db.master.findUnique({ where: { id }, include: { skills: { select: { id: true } }, timeOff: { orderBy: { from: "asc" } } } });
  if (!m) notFound();
  const init: MasterPayload = {
    slug: m.slug, name: m.name as Record<string, string>, bio: m.bio as Record<string, string>, photo: m.photo, phone: m.phone || "", experienceYears: m.experienceYears, languages: m.languages,
    workingHours: m.workingHours as MasterPayload["workingHours"], active: m.active, sort: m.sort, skills: m.skills.map((s) => s.id),
    timeOff: m.timeOff.map((t) => ({ from: ymd(t.from), to: ymd(t.to), reason: t.reason })),
  };
  return <MasterEditor id={m.id} initial={init} services={sv} stats={{ rating: m.rating, reviews: m.reviewsCount, jobs: m.jobsCount, linked: !!m.userId, slug: m.slug }} />;
}
