"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ccCommentAction, ccTransitionAction, ccUpdateTaskAction } from "@/server/actions/admin/cc";
import { BLOCKED_ON_LABELS, OWNERS, PRIORITIES, STAGES, STATUSES } from "@/lib/backlog-labels";
import { isCodeTask, needsReason, type TaskStatusKey } from "@/lib/cc-flow";
import { TextInput } from "@/components/admin/fields";
import { cn } from "@/lib/format";

export const STATUS_TONE: Record<string, string> = {
  backlog: "bg-surface text-muted",
  ready: "bg-ok-50 text-ok",
  in_progress: "bg-brand-50 text-brand",
  review: "bg-warn-50 text-warn",
  blocked: "bg-bad-50 text-bad",
  done: "bg-ok-50 text-ok",
  cancelled: "bg-surface text-muted",
};

type Result = { ok: true } | { ok: false; error: string; detail?: string };

/** Текст ошибки гейта: для «не готова» — какие именно пункты готовности не выполнены */
function useGateError() {
  const t = useTranslations("admin.cc");
  return (r: Result) => {
    if (r.ok) return null;
    const base = t.has(`gate.${r.error}`) ? t(`gate.${r.error}` as "gate.invalid") : r.error;
    if (r.error === "not_ready" && r.detail) return `${base}: ${r.detail.split(",").map((k) => (t.has(`dor.items.${k}`) ? t(`dor.items.${k}` as "dor.items.why") : k)).join("; ")}`;
    return r.detail ? `${base} (${r.detail})` : base;
  };
}

/**
 * Переходы статуса в карточке задачи. Кнопки — только разрешённые переходы; переход, которому нужна причина,
 * отчёт или доказательство, открывает поле для текста. Ошибки гейтов показываются словами
 */
export function TransitionPanel({ taskKey, status, layer, moves }: { taskKey: string; status: string; layer: string; moves: TaskStatusKey[] }) {
  const t = useTranslations("admin.cc");
  const router = useRouter();
  const gateError = useGateError();
  const [to, setTo] = useState<TaskStatusKey | null>(null);
  const [text, setText] = useState("");
  const [sha, setSha] = useState("");
  const [on, setOn] = useState("owner");
  const [force, setForce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (target: TaskStatusKey) =>
    start(async () => {
      setError(null);
      const r = (await ccTransitionAction(taskKey, { to: target, text: text || undefined, sha: sha || undefined, blockedOn: target === "blocked" ? (on as "owner") : undefined, force: force || undefined })) as Result;
      if (!r.ok) return setError(gateError(r));
      setTo(null);
      setText("");
      setSha("");
      setForce(false);
      router.refresh();
    });

  const needsForm = (target: TaskStatusKey) => needsReason(status, target) || target === "done" || target === "review" || target === "blocked";
  const label = to === "review" ? t("move.report") : to === "done" ? t("move.proof") : t("move.reason");

  if (!moves.length) return <p className="text-xs text-muted">{t("move.noMoves")}</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {moves.map((m) => (
          <button
            key={m}
            type="button"
            disabled={pending}
            className={cn("chip border border-line text-xs", to === m ? STATUS_TONE[m] : "bg-paper")}
            onClick={() => (needsForm(m) ? setTo(to === m ? null : m) : submit(m))}
          >
            → {STATUSES[m]}
          </button>
        ))}
      </div>
      {status === "ready" && <p className="text-xs text-muted">{t("move.claimHint", { key: taskKey })}</p>}
      {to && (
        <div className="space-y-2 rounded-lg bg-surface p-2.5">
          {to === "blocked" && (
            <div>
              <label className="label">{t("move.blockedOn")}</label>
              <select className="input" value={on} onChange={(e) => setOn(e.target.value)}>
                {Object.entries(BLOCKED_ON_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          )}
          {to === "done" && isCodeTask(layer) && <TextInput label={t("move.sha")} value={sha} onChange={setSha} placeholder="d149ace" />}
          <div>
            <label className="label">{label}</label>
            <textarea className="input min-h-20 py-2 text-sm" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            {t("move.force")}
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => submit(to)}>
              {t("move.submit")}: {STATUSES[to]}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setTo(null)}>
              {t("move.cancel")}
            </button>
          </div>
        </div>
      )}
      {error && <p className="rounded-lg bg-bad-50 px-3 py-2 text-xs text-bad">{error}</p>}
    </div>
  );
}

/** Одна кнопка перехода без формы: «Готова» у готовой по чек-листу задачи, «Вернуть в очередь» у брошенной */
export function QuickMove({ taskKey, to, text, label, className }: { taskKey: string; to: TaskStatusKey; text?: string; label: string; className?: string }) {
  const router = useRouter();
  const gateError = useGateError();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        className={cn("btn-outline btn-sm whitespace-nowrap", className)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          start(async () => {
            const r = (await ccTransitionAction(taskKey, { to, text })) as Result;
            if (!r.ok) return setError(gateError(r));
            router.refresh();
          });
        }}
      >
        {label}
      </button>
      {error && <span className="mt-1 max-w-56 text-right text-[11px] text-bad">{error}</span>}
    </span>
  );
}

type Editable = { owner: string; priority: string; stage: string; assignee: string };

/** Атрибуты задачи: кто делает, приоритет, этап, исполнитель-человек. Статус меняется отдельно — переходами */
export function TaskEditor({ taskKey, initial }: { taskKey: string; initial: Editable }) {
  const t = useTranslations("admin.cc");
  const [form, setForm] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const set = (patch: Partial<Editable>) => setForm((f) => ({ ...f, ...patch }));
  const select = (field: "owner" | "priority" | "stage", options: Record<string, string>) => (
    <div>
      <label className="label">{t(field)}</label>
      <select className="input" value={form[field]} onChange={(e) => set({ [field]: e.target.value })}>
        {Object.entries(options).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
        {select("owner", OWNERS)}
        {select("priority", PRIORITIES)}
        {select("stage", STAGES)}
        <TextInput label={t("assignee")} placeholder={t("assigneePh")} value={form.assignee} onChange={(v) => set({ assignee: v })} />
      </div>
      <button
        className="btn-outline btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await ccUpdateTaskAction(taskKey, form);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
            router.refresh();
          })
        }
      >
        {saved ? t("saved") : t("save")}
      </button>
    </div>
  );
}

export function CommentForm({ taskKey }: { taskKey: string }) {
  const t = useTranslations("admin.cc");
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="mt-3">
      <textarea className={cn("input min-h-20 py-2")} placeholder={t("addComment")} value={text} onChange={(e) => setText(e.target.value)} />
      <button
        className="btn-outline btn-sm mt-2"
        disabled={pending || text.trim().length < 2}
        onClick={() =>
          start(async () => {
            const r = await ccCommentAction(taskKey, text);
            if (r.ok) setText("");
            router.refresh();
          })
        }
      >
        {t("send")}
      </button>
    </div>
  );
}
