import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { pageUser } from "@/server/adminPage";
import { Forbidden } from "@/components/admin/ui";
import { TaskDetail } from "@/components/admin/cc/TaskDetail";

export const dynamic = "force-dynamic";

/** Отдельная страница задачи — та же карточка, что открывается шторкой из списка и доски */
export default async function TaskPage({ params }: { params: Promise<{ locale: string; key: string }> }) {
  const { locale, key } = await params;
  setRequestLocale(locale);
  if (!(await pageUser("control"))) return <Forbidden />;
  const t = await getTranslations("admin.cc");
  return (
    <div className="max-w-6xl">
      <Link href="/admin/control" className="btn-ghost btn-sm mb-2 inline-flex items-center gap-1 px-2">
        <ArrowLeft size={16} /> {t("back")}
      </Link>
      <TaskDetail taskKey={decodeURIComponent(key)} locale={locale} taskHref={(k) => `/admin/control/${k}`} />
    </div>
  );
}
