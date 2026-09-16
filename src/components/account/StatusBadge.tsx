import { cn } from "@/lib/format";

const TONE: Record<string, string> = {
  ACTIVE: "bg-ok-50 text-ok",
  SCHEDULED: "bg-surface text-ink",
  CONFIRMED: "bg-ok-50 text-ok",
  ON_WAY: "bg-brand-50 text-brand",
  IN_PROGRESS: "bg-brand-50 text-brand",
  DONE: "bg-ok-50 text-ok",
  COMPLETED: "bg-surface text-muted",
  PAUSED: "bg-warn-50 text-warn",
  UNSCHEDULED: "bg-warn-50 text-warn",
  SKIPPED: "bg-surface text-muted",
  CANCELLED: "bg-bad-50 text-bad",
  NO_SHOW: "bg-bad-50 text-bad",
  PENDING: "bg-warn-50 text-warn",
  PAID: "bg-ok-50 text-ok",
  APPROVED: "bg-ok-50 text-ok",
  REJECTED: "bg-bad-50 text-bad",
};

export function StatusBadge({ status, label, className }: { status: string; label: string; className?: string }) {
  return <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE[status] || "bg-surface", className)}>{label}</span>;
}
