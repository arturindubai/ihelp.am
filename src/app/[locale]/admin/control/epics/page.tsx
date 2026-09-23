import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { pageUser } from "@/server/adminPage";
import { listEpics } from "@/server/services/epics";
import { EPIC_STATUSES } from "@/lib/backlog-labels";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { Card } from "@/components/admin/fields";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  planned: "bg-surface text-muted",
  in_progress: "bg-brand-50 text-brand",
  testing: "bg-warn-50 text-warn",
  ready: "bg-warn-50 text-warn",
  done: "bg-ok-50 text-ok",
};

export default async function EpicsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await pageUser("control"))) return <Forbidden />;
  const [t, epics] = await Promise.all([getTranslations("admin.cc"), listEpics()]);

  return (
    <div className="max-w-4xl">
      <PageHead
        title={
          <span className="flex items-center gap-2">
            <Link href="/admin/control" className="btn-ghost btn-sm px-2" aria-label={t("back")}>
              <ArrowLeft size={18} />
            </Link>
            {t("epics.title")}
          </span>
        }
        sub={t("epics.subtitle")}
        actions={
          <Link href="/admin/control/epics/new" className="btn-primary btn-sm">
            {t("epics.newEpic")}
          </Link>
        }
      />

      <Card>
        <ul className="divide-y divide-line">
          {epics.map((e) => (
            <li key={e.key} className="py-3">
              <Link href={`/admin/control/epics/${e.key}`} className="block">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{e.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[e.status]}`}>{EPIC_STATUSES[e.status]}</span>
                  <span className="text-xs text-muted">
                    {t("epics.tasksCount", { done: e.taskDone, total: e.taskTotal })}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">{e.summary}</p>
              </Link>
            </li>
          ))}
          {epics.length === 0 && <p className="py-3 text-sm text-muted">{t("epics.empty")}</p>}
        </ul>
      </Card>
    </div>
  );
}
