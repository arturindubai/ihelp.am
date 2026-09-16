import { cn } from "@/lib/format";

export function PageHead({ title, actions, sub }: { title: React.ReactNode; actions?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <div className="text-sm text-muted">{sub}</div>}
      </div>
      {actions}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold", tone === "ok" && "text-ok", tone === "warn" && "text-warn", tone === "bad" && "text-bad")}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

export function Forbidden() {
  return <div className="card p-10 text-center text-muted">403</div>;
}

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-surface/60 text-left text-xs text-muted">
          <tr>{head.map((h, i) => <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty && <div className="p-8 text-center text-muted">—</div>}
    </div>
  );
}
