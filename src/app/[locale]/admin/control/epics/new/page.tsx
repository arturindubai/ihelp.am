import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { pageUser } from "@/server/adminPage";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { Card } from "@/components/admin/fields";
import { EMPTY_EPIC, EpicEditorForm } from "@/components/admin/cc/EpicEditorForm";

export const dynamic = "force-dynamic";

export default async function NewEpicPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await pageUser("control"))) return <Forbidden />;
  const t = await getTranslations("admin.cc");
  return (
    <div className="max-w-4xl">
      <PageHead
        title={
          <span className="flex items-center gap-2">
            <Link href="/admin/control/epics" className="btn-ghost btn-sm px-2" aria-label={t("back")}>
              <ArrowLeft size={18} />
            </Link>
            {t("epics.newEpic")}
          </span>
        }
      />
      <Card>
        <EpicEditorForm initial={EMPTY_EPIC} isNew />
      </Card>
    </div>
  );
}
