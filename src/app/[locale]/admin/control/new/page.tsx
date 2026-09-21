import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { pageUser } from "@/server/adminPage";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { Card } from "@/components/admin/fields";
import { EMPTY_TASK, TaskEditorForm } from "@/components/admin/cc/TaskEditorForm";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await pageUser("control"))) return <Forbidden />;
  const t = await getTranslations("admin.cc");
  return (
    <div className="max-w-4xl">
      <PageHead
        title={
          <span className="flex items-center gap-2">
            <Link href="/admin/control" className="btn-ghost btn-sm px-2" aria-label={t("back")}>
              <ArrowLeft size={18} />
            </Link>
            {t("newTask")}
          </span>
        }
      />
      <Card>
        <TaskEditorForm initial={EMPTY_TASK} isNew />
      </Card>
    </div>
  );
}
