import { setRequestLocale } from "next-intl/server";
import { pageUser } from "@/server/adminPage";
import { Forbidden } from "@/components/admin/ui";
import { TaskDetail } from "@/components/admin/cc/TaskDetail";
import { TaskDrawer } from "@/components/admin/cc/TaskDrawer";
import { CcHeader } from "@/components/admin/cc/CcHeader";
import { BacklogTab } from "@/components/admin/cc/tabs/BacklogTab";
import { ApprovalsTab, DeployerTab, DevTab, YouTab } from "@/components/admin/cc/tabs/QueueTabs";
import { ActivityTab, DoneTab, NotifyTab, PlansTab } from "@/components/admin/cc/tabs/FeedTabs";
import { WorkersTab } from "@/components/admin/cc/tabs/WorkersTab";
import { TABS, ccHref, type CcSearch, type Tab } from "@/components/admin/cc/tabs/shared";

export const dynamic = "force-dynamic";

/**
 * Control Center — пульт проекта по образцу Command Center LIA: вкладки Бэклог, Нужен ты, В разработке, Деплоер,
 * Планы, Согласования, Воркеры, Активность, Готово, Сообщения. Клик по задаче открывает шторку со всем по ней
 * (?task=КЛЮЧ), фильтры и вкладка остаются в адресе — ссылку можно переслать
 */
export default async function ControlCenter({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<CcSearch> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await pageUser("control"))) return <Forbidden />;
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "backlog";
  const taskHref = (key: string) => ccHref(sp, { task: key });

  return (
    <div className="max-w-6xl">
      <CcHeader page="board" locale={locale} tab={tab} />

      {tab === "backlog" && <BacklogTab sp={sp} taskHref={taskHref} />}
      {tab === "you" && <YouTab taskHref={taskHref} />}
      {tab === "dev" && <DevTab taskHref={taskHref} />}
      {tab === "deployer" && <DeployerTab taskHref={taskHref} />}
      {tab === "plans" && <PlansTab />}
      {tab === "approvals" && <ApprovalsTab taskHref={taskHref} />}
      {tab === "workers" && <WorkersTab locale={locale} taskHref={taskHref} />}
      {tab === "activity" && <ActivityTab locale={locale} taskHref={taskHref} />}
      {tab === "done" && <DoneTab locale={locale} taskHref={taskHref} />}
      {tab === "notify" && <NotifyTab locale={locale} taskHref={taskHref} />}

      {sp.task && (
        <TaskDrawer closeHref={ccHref(sp, { task: "" })} pageHref={`/admin/control/${sp.task}`}>
          <TaskDetail taskKey={sp.task} locale={locale} taskHref={taskHref} />
        </TaskDrawer>
      )}
    </div>
  );
}
