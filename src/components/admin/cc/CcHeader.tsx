import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ccCounts, intakeHistory } from "@/server/services/ccBoard";
import { getWorkersConfig } from "@/server/services/workers";
import { IntakeButton } from "@/components/admin/cc/CcControls";
import { TABS, type Tab } from "./tabs/shared";
import { cn } from "@/lib/format";

const PAGES = [
  { id: "board", href: "/admin/control", icon: "⚡" },
  { id: "releases", href: "/admin/control/releases", icon: "📝" },
  { id: "health", href: "/admin/control/health", icon: "❤" },
  { id: "logs", href: "/admin/control/logs", icon: "📋" },
  { id: "epics", href: "/admin/control/epics", icon: "📐" },
] as const;

const TAB_ICON: Record<Tab, string> = {
  backlog: "📋",
  you: "⚡",
  dev: "🛠",
  deployer: "🚀",
  plans: "📐",
  approvals: "✅",
  workers: "🤖",
  activity: "🧾",
  done: "✓",
  notify: "🔔",
};

/**
 * Шапка Control Center, как в LIA: разделы (пульт, релизы, здоровье, логи, эпики), поиск, Intake и новая задача.
 * На странице пульта под ней — вкладки со счётчиками
 */
export async function CcHeader({ page, locale, tab }: { page: (typeof PAGES)[number]["id"]; locale: string; tab?: Tab }) {
  const [t, history, counts, config] = await Promise.all([getTranslations("admin.cc"), intakeHistory(12), tab ? ccCounts() : null, tab ? getWorkersConfig() : null]);
  const badge: Partial<Record<Tab, number>> = counts
    ? { backlog: counts.backlog, you: counts.you, dev: counts.dev, deployer: counts.deployer, approvals: counts.approvals, notify: counts.notify }
    : {};
  const loud: Tab[] = ["you", "approvals", "notify"];

  return (
    <div className="mb-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <div className="hidden text-sm text-muted sm:block">{t("subtitle")}</div>
        </div>
        {tab !== "backlog" && (
          <form action={`/${locale}/admin/control`} className="hidden sm:block">
            <input type="hidden" name="tab" value="backlog" />
            <input name="q" placeholder={t("searchAll")} className="input h-9 w-48 py-1 text-sm" />
          </form>
        )}
        <IntakeButton history={history} />
        <Link href="/admin/control/new" className="btn-outline btn-sm">
          {t("newTask")}
        </Link>
      </div>

      <nav className="mb-2 flex flex-wrap gap-1 text-sm">
        {PAGES.map((p) => (
          <Link key={p.id} href={p.href} className={cn("shrink-0 rounded-lg px-3 py-1.5", page === p.id ? "bg-ink text-inverse" : "text-muted hover:bg-surface")}>
            {p.icon} {t(`pages.${p.id}`)}
          </Link>
        ))}
      </nav>

      {tab && (
        <nav className="flex flex-wrap gap-1 border-b border-line pb-2 text-sm">
          {TABS.map((id) => {
            const n = badge[id];
            return (
              <Link
                key={id}
                href={id === "backlog" ? "/admin/control" : `/admin/control?tab=${id}`}
                className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5", tab === id ? "bg-surface font-semibold text-ink" : "text-muted hover:bg-surface")}
              >
                <span>{TAB_ICON[id]}</span>
                {t(`tabs.${id}`)}
                {id === "workers" && config && <span className={cn("size-2 rounded-full", counts?.running ? "animate-pulse bg-brand" : config.enabled ? "bg-ok" : "bg-muted")} />}
                {n != null && n > 0 && <span className={cn("rounded-full px-1.5 text-[11px]", loud.includes(id) ? "bg-brand text-inverse" : "text-muted")}>{n}</span>}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
