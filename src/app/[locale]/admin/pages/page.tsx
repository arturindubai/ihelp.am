import { getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { pageUser } from "@/server/adminPage";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { PageManager } from "@/components/admin/ContentManagers";

export default async function AdminPages() {
  if (!(await pageUser("pages"))) return <Forbidden />;
  const t = await getTranslations("admin");
  const pages = await db.page.findMany({ orderBy: { slug: "asc" } });
  return (
    <div className="max-w-3xl">
      <PageHead title={t("pages.title")} />
      <PageManager pages={pages.map((p) => ({ id: p.id, data: { slug: p.slug, title: p.title as Record<string, string>, body: p.body as Record<string, string>, active: p.active } }))} />
    </div>
  );
}
