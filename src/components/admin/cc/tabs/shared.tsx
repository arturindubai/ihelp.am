import { Link } from "@/i18n/navigation";
import { PRIORITIES } from "@/lib/backlog-labels";
import { cn } from "@/lib/format";

/** Параметры адреса пульта: вкладка, открытая задача и фильтры вкладки */
export type CcSearch = Partial<Record<string, string>>;

export const TABS = ["backlog", "you", "dev", "deployer", "plans", "approvals", "workers", "activity", "done", "notify"] as const;
export type Tab = (typeof TABS)[number];

export function ccHref(sp: CcSearch, patch: CcSearch) {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next[k] = v;
  const qs = new URLSearchParams(next).toString();
  return `/admin/control${qs ? `?${qs}` : ""}`;
}

export const LANE_DOT: Record<string, string> = {
  inbox: "bg-cta",
  dev: "bg-brand",
  bugs: "bg-bad",
  infra: "bg-ink",
  design: "bg-warn",
  product: "bg-ok",
};

export const FLOW_TONE: Record<string, string> = {
  triage: "bg-brand-50 text-brand",
  owner: "bg-warn-50 text-warn",
  deployer: "bg-ok-50 text-ok",
  testing: "bg-brand-100 text-brand-600",
  working: "bg-brand-50 text-brand",
  queued: "bg-surface text-ink",
  blocked: "bg-bad-50 text-bad",
  backlog: "bg-surface text-muted",
  done: "bg-ok-50 text-ok",
  cancelled: "bg-surface text-muted",
};

export const PRIORITY_TONE: Record<string, string> = { p0: "bg-bad-50 text-bad", p1: "bg-warn-50 text-warn", p2: "bg-surface text-muted", p3: "bg-surface text-muted" };

export const RUN_TONE: Record<string, string> = {
  running: "bg-brand-50 text-brand",
  done: "bg-ok-50 text-ok",
  failed: "bg-bad-50 text-bad",
  timeout: "bg-bad-50 text-bad",
  limit: "bg-warn-50 text-warn",
  stopped: "bg-surface text-muted",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- t из next-intl типизирован ключами сообщений
type T = (key: any, values?: any) => string;

/** «5 мин назад», «3 ч назад», «2 дн назад» */
export function ago(t: T, d: Date | string | null | undefined) {
  if (!d) return "—";
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60_000));
  return m < 60 ? t("minAgo", { m }) : m < 48 * 60 ? t("hoursAgo", { h: Math.round(m / 60) }) : t("daysAgo", { d: Math.round(m / 1440) });
}

/** Строка задачи в списках вкладок: ключ, приоритет, заголовок, справа — что угодно */
export function TaskLine({ k, title, priority, href, right, sub, tone }: { k: string; title: string; priority?: string; href: string; right?: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <li className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-2", tone)}>
      <Link href={href} scroll={false} className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="w-24 shrink-0 font-mono text-xs text-muted">{k}</span>
        <span className="min-w-0">
          <span className="font-medium">{title}</span>
          {priority && <span className={cn("chip ml-2 align-middle text-[10px]", PRIORITY_TONE[priority])}>{PRIORITIES[priority]}</span>}
          {sub && <span className="block text-xs text-muted">{sub}</span>}
        </span>
      </Link>
      {right}
    </li>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>;
}
