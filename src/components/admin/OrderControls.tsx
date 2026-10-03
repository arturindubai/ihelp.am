"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { adminAddVisitAction, adminDeleteVisitAction, adminGenerateAction, adminOrderAction, adminVisitAction } from "@/server/actions/admin/orders";
import { getVisitEventsAction, type VisitEventEntry } from "@/server/actions/admin/visitEvents";
import { amd } from "@/lib/format";
import { addDays, ymd } from "@/lib/time";
import { Sheet } from "@/components/ui/Sheet";
import { StatusBadge } from "@/components/account/StatusBadge";

type M = { id: string; name: string; active: boolean };

const VISIT_STATUSES = ["UNSCHEDULED", "SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS", "DONE", "CANCELLED", "SKIPPED", "NO_SHOW"];
/** Статусы, требующие подтверждения с предупреждением о сообщении клиенту */
const CRITICAL_VISIT_STATUSES = ["DONE", "CANCELLED", "NO_SHOW", "ON_WAY"];

function VisitHistory({ visitId }: { visitId: string }) {
  const t = useTranslations("admin.orders");
  const to = useTranslations("order");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<VisitEventEntry[] | null>(null);

  const load = async () => {
    if (events !== null) { setOpen(true); return; }
    setLoading(true);
    try {
      const data = await getVisitEventsAction(visitId);
      setEvents(data);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const formatStatus = (s: string) => {
    if (s === "CASH_SET") return t("visitHistoryCashSet");
    if (s === "CASH_CLEARED") return t("visitHistoryCashCleared");
    try { return to(`visitStatus.${s}`); } catch { return s; }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", { timeZone: "Asia/Yerevan", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="mt-2">
      <button className="btn-ghost btn-sm text-muted" onClick={() => open ? setOpen(false) : load()} disabled={loading}>
        {t("visitHistory")} {loading ? "…" : open ? "▴" : "▸"}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 text-xs text-muted">
          {events && events.length === 0 && <li>{t("visitHistoryEmpty")}</li>}
          {events && events.map((e) => (
            <li key={e.id}>
              {formatDate(e.createdAt)} · {e.actor}
              {e.prevStatus ? ` · ${formatStatus(e.prevStatus)} → ${formatStatus(e.status)}` : ` · ${formatStatus(e.status)}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminVisitRow({ visit, masters }: { visit: { id: string; index: number; status: string; date: string | null; label: string; masterId: string | null; price: number; cash: boolean; isCash: boolean; note: string | null }; masters: M[] }) {
  const t = useTranslations("admin.orders");
  const tc = useTranslations("admin.common");
  const to = useTranslations("order");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string>();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const init = visit.date ? new Date(visit.date) : null;
  const [date, setDate] = useState(init ? ymd(init) : addDays(ymd(new Date()), 1));
  const [time, setTime] = useState(init ? new Date(init.getTime() + 4 * 3600_000).toISOString().slice(11, 16) : "10:00");

  const run = (patch: Parameters<typeof adminVisitAction>[1]) => start(async () => {
    setErr(undefined);
    const r = await adminVisitAction(visit.id, patch);
    if (!r.ok) return setErr(t("slotBusy"));
    setOpen(false);
    router.refresh();
  });

  const applyStatus = (s: string) => {
    run({ status: s as "DONE" });
    setStatusSheetOpen(false);
    setPendingStatus(null);
  };

  const isDone = visit.status === "DONE";

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-6 text-xs text-muted">#{visit.index}</span>
        <span className="min-w-40 flex-1 font-medium">{visit.label}</span>
        <select className="input min-h-9 w-auto py-1 text-sm" value={visit.masterId || ""} disabled={pending} onChange={(e) => run({ masterId: e.target.value || null })}>
          <option value="">{t("noMaster")}</option>
          {masters.map((m) => <option key={m.id} value={m.id}>{m.name}{m.active ? "" : ` (${tc("archived")})`}</option>)}
        </select>
        <button
          className="btn-outline btn-sm"
          disabled={pending}
          onClick={() => { setPendingStatus(null); setStatusSheetOpen(true); }}
        >
          {to(`visitStatus.${visit.status}`)}
        </button>
        <span className="w-20 text-right text-sm font-semibold">{amd(visit.price)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-8">
        <button className="btn-outline btn-sm" onClick={() => setOpen(true)}>{visit.date ? t("reschedule") : t("schedule")}</button>
        {visit.isCash && <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="size-4" checked={visit.cash} disabled={pending} onChange={(e) => run({ cash: e.target.checked })} /> {t("cash")}</label>}
        {visit.note && <span className="text-xs text-muted">📝 {visit.note}</span>}
        {err && <span className="text-sm text-bad">{err}</span>}
      </div>
      <VisitHistory visitId={visit.id} />

      {/* Sheet: смена статуса с подтверждением для критичных */}
      <Sheet
        open={statusSheetOpen}
        onClose={() => { setStatusSheetOpen(false); setPendingStatus(null); }}
        title={pendingStatus ? to(`visitStatus.${pendingStatus}`) : t("visitStatus")}
      >
        {pendingStatus ? (
          <div className="space-y-4 py-2">
            <p className="text-sm">{t("clientWillBeNotified")}</p>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={pending} onClick={() => applyStatus(pendingStatus)}>
                {tc("confirm")}
              </button>
              <button className="btn-ghost" onClick={() => setPendingStatus(null)}>
                {tc("back")}
              </button>
            </div>
          </div>
        ) : (
          <div className="py-2 space-y-1">
            {VISIT_STATUSES.map((s) => (
              <button
                key={s}
                className={`btn-ghost w-full text-left${s === visit.status ? " font-semibold text-brand" : ""}`}
                disabled={pending}
                onClick={() => {
                  if (CRITICAL_VISIT_STATUSES.includes(s)) {
                    setPendingStatus(s);
                  } else {
                    applyStatus(s);
                  }
                }}
              >
                {to(`visitStatus.${s}`)}
              </button>
            ))}
          </div>
        )}
      </Sheet>

      {/* Sheet: перенос/удаление визита */}
      <Sheet open={open} onClose={() => setOpen(false)} title={t("reschedule")} footer={
        <div className="space-y-2">
          {err && <p className="text-sm text-bad">{err}</p>}
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={pending} onClick={() => run({ date, time })}>{tc("save")}</button>
            {err && <button className="btn-outline" disabled={pending} onClick={() => run({ date, time, force: true })}>{t("force")}</button>}
          </div>
          {isDone ? (
            <p className="text-xs text-muted">{t("deleteVisitDoneBlock")}</p>
          ) : (
            <button
              className="btn-ghost btn-sm w-full text-bad"
              onClick={() => { setOpen(false); setDeleteConfirmOpen(true); }}
            >
              {tc("delete")}
            </button>
          )}
        </div>
      }>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{tc("date")}</label><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label className="label">{t("forceTime")}</label><input type="time" step={900} className="input" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        </div>
      </Sheet>

      {/* Sheet: подтверждение удаления визита */}
      <Sheet open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} title={t("deleteVisitTitle")} footer={
        <div className="flex gap-2">
          <button className="btn-danger flex-1" disabled={pending} onClick={() => start(async () => {
            const r = await adminDeleteVisitAction(visit.id);
            if (!r.ok) { setErr(r.error === "done_visit" ? t("deleteVisitDoneBlock") : tc("error")); setDeleteConfirmOpen(false); return; }
            router.refresh();
          })}>{t("deleteVisitConfirm")}</button>
          <button className="btn-ghost" onClick={() => setDeleteConfirmOpen(false)}>{tc("cancel")}</button>
        </div>
      }>
        <p className="py-2 text-sm">{t("deleteVisitBody")}</p>
      </Sheet>
    </li>
  );
}

export function AdminAddVisit({ orderId, masters, isSubscription }: { orderId: string; masters: M[]; isSubscription: boolean }) {
  const t = useTranslations("admin.orders");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [date, setDate] = useState(addDays(ymd(new Date()), 1));
  const [time, setTime] = useState("10:00");
  const [masterId, setMasterId] = useState("");
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
      <button className="btn-outline btn-sm" onClick={() => setOpen(true)}>+ {t("addVisit")}</button>
      {isSubscription && <button className="btn-outline btn-sm" disabled={pending} onClick={() => start(async () => { const r = await adminGenerateAction(orderId); setMsg(t("generated", { n: r.n })); router.refresh(); })}>{t("generate")}</button>}
      {msg && <span className="text-sm text-ok">{msg}</span>}
      <Sheet open={open} onClose={() => setOpen(false)} title={t("addVisit")} footer={<button className="btn-primary w-full" disabled={pending} onClick={() => start(async () => { await adminAddVisitAction(orderId, date, time, masterId || null); setOpen(false); router.refresh(); })}>{tc("add")}</button>}>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{tc("date")}</label><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label className="label">{t("forceTime")}</label><input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          <div className="col-span-2"><label className="label">{t("assignMaster")}</label>
            <select className="input" value={masterId} onChange={(e) => setMasterId(e.target.value)}><option value="">{t("noMaster")}</option>{masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

export function AdminOrderControls({ order, masters }: { order: { id: string; status: string; kind: string; paymentStatus: string; preferredMasterId: string | null; pausedUntil: string | null }; masters: M[] }) {
  const t = useTranslations("admin.orders");
  const tc = useTranslations("admin.common");
  const to = useTranslations("order");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState(order.pausedUntil || addDays(ymd(new Date()), 14));
  const run = (patch: Parameters<typeof adminOrderAction>[1]) => start(async () => { await adminOrderAction(order.id, patch); router.refresh(); });
  return (
    <section className="card space-y-3 p-4 text-sm">
      <div>
        <label className="label">{t("changeStatus")}</label>
        <div className="flex items-center gap-2"><StatusBadge status={order.status} label={to(`status.${order.status}`)} className="mt-0" /></div>
        <div className="mt-2 flex flex-wrap gap-2">
          {order.status !== "ACTIVE" && order.status !== "CANCELLED" && <button className="btn-outline btn-sm" disabled={pending} onClick={() => run({ status: "ACTIVE" })}>{t("resume")}</button>}
          {order.status === "ACTIVE" && order.kind !== "ONE_TIME" && <button className="btn-outline btn-sm" disabled={pending} onClick={() => run({ status: "COMPLETED" })}>{to("status.COMPLETED")}</button>}
        </div>
      </div>
      {order.kind === "SUBSCRIPTION" && order.status === "ACTIVE" && (
        <div>
          <label className="label">{t("pausedUntil")}</label>
          <div className="flex gap-2"><input type="date" className="input" value={until} onChange={(e) => setUntil(e.target.value)} /><button className="btn-outline" disabled={pending} onClick={() => run({ status: "PAUSED", pausedUntil: until })}>{t("pause")}</button></div>
        </div>
      )}
      <div>
        <label className="label">{t("preferredMaster")}</label>
        <select className="input" value={order.preferredMasterId || ""} disabled={pending} onChange={(e) => run({ preferredMasterId: e.target.value || null })}>
          <option value="">{t("noMaster")}</option>
          {masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">{t("payment")}</label>
        <select className="input" value={order.paymentStatus} disabled={pending} onChange={(e) => run({ paymentStatus: e.target.value as "PAID" })}>
          {["PENDING", "PARTIAL", "PAID", "REFUNDED"].map((s) => <option key={s} value={s}>{to(`payStatus.${s}`)}</option>)}
        </select>
      </div>
      {order.status !== "CANCELLED" && (
        <div className="border-t border-line pt-3">
          <input className="input" placeholder={t("cancelReason")} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-danger mt-2 w-full" disabled={pending} onClick={() => { if (confirm(t("cancelConfirm"))) run({ status: "CANCELLED", cancelReason: reason }); }}>{t("cancelOrder")}</button>
        </div>
      )}
    </section>
  );
}
