"use client";
import { useState, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ccCommentAction, ccTransitionAction, ccUpdateTaskAction } from "@/server/actions/admin/cc";
import { BLOCKED_ON_LABELS, OWNERS, PRIORITIES, STAGES, STATUSES } from "@/lib/backlog-labels";
import { isCodeTask, needsReason, type CriterionResult, type TaskStatusKey } from "@/lib/cc-flow";
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
export function TransitionPanel({
  taskKey, status, source, layer, moves, requirements = [], currentReleaseNote = "",
}: {
  taskKey: string; status: string; source: string; layer: string; moves: TaskStatusKey[];
  /** Критерии приёмки — для чек-листа в форме «→ Сделано» */
  requirements?: string[];
  /** Текущее значение releaseNote задачи — для предзаполнения поля */
  currentReleaseNote?: string;
}) {
  const t = useTranslations("admin.cc");
  const router = useRouter();
  const gateError = useGateError();
  const [to, setTo] = useState<TaskStatusKey | null>(null);
  const [text, setText] = useState("");
  const [sha, setSha] = useState("");
  const [on, setOn] = useState("owner");
  const [force, setForce] = useState(false);
  const [closingMap, setClosingMap] = useState("");
  const [whatChanged, setWhatChanged] = useState(currentReleaseNote);
  const [criteriaChecked, setCriteriaChecked] = useState<boolean[]>(() => requirements.map(() => false));
  const [criteriaCards, setCriteriaCards] = useState<string[]>(() => requirements.map(() => ""));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Сброс состояния чек-листа при изменении списка критериев (без перезагрузки страницы)
  useEffect(() => {
    setCriteriaChecked(requirements.map(() => false));
    setCriteriaCards(requirements.map(() => ""));
  }, [requirements.length]);

  const needsClosingMap = source === "intake" && (to === "done" || to === "cancelled");
  const isCode = isCodeTask(layer);

  const buildCriteriaResult = (): CriterionResult[] =>
    requirements.map((_, i) => ({ done: criteriaChecked[i] ?? false, cardKey: criteriaCards[i] || undefined }));

  const setCritCheck = (i: number, v: boolean) => setCriteriaChecked((prev) => prev.map((c, idx) => (idx === i ? v : c)));
  const setCritCard = (i: number, v: string) => setCriteriaCards((prev) => prev.map((c, idx) => (idx === i ? v : c)));

  const CARD_KEY_RE = /^[A-Z]+-\d+$/;
  // Кнопка «→ Сделано»: заблокирована только если нет «Что изменилось» для код-задачи.
  // Незакрытые критерии без ключа = follow-up карточки создаст сервер автоматически.
  const doneBlocked = to === "done" && isCode && !whatChanged.trim() && !force;

  const submit = (target: TaskStatusKey) =>
    start(async () => {
      setError(null);
      const r = (await ccTransitionAction(taskKey, {
        to: target,
        text: text || undefined,
        sha: sha || undefined,
        blockedOn: target === "blocked" ? (on as "owner") : undefined,
        force: force || undefined,
        intakeClosingMap: (source === "intake" && (target === "done" || target === "cancelled")) ? (closingMap || undefined) : undefined,
        releaseNote: (target === "done" || (target === "review" && isCode && whatChanged.trim())) ? (whatChanged.trim() || undefined) : undefined,
        criteriaResult: target === "done" && requirements.length > 0 ? buildCriteriaResult() : undefined,
      })) as Result;
      if (!r.ok) return setError(gateError(r));
      setTo(null);
      setText("");
      setSha("");
      setClosingMap("");
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
          {to === "done" && isCode && <TextInput label={t("move.sha")} value={sha} onChange={setSha} placeholder="d149ace" />}
          {/* Чек-лист критериев (только для «→ Сделано» и если критерии есть) */}
          {to === "done" && requirements.length > 0 && (
            <div className="space-y-1.5 rounded-lg bg-surface p-2.5">
              <label className="label">{t("move.criteriaLabel")}</label>
              {requirements.map((req, i) => {
                const hasValidKey = !criteriaChecked[i] && CARD_KEY_RE.test(criteriaCards[i] ?? "");
                const willCreate = !criteriaChecked[i] && !hasValidKey;
                return (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 shrink-0"
                      checked={criteriaChecked[i] ?? false}
                      onChange={(e) => setCritCheck(i, e.target.checked)}
                    />
                    <span className={cn("flex-1 break-words", criteriaChecked[i] ? "text-muted line-through" : "text-ink")}>{req}</span>
                    {!criteriaChecked[i] && (
                      <div className="flex shrink-0 items-center gap-1">
                        {hasValidKey && <span className="text-xs text-muted">{t("move.criteriaSpawnedCard")}</span>}
                        {willCreate && <span className="text-xs text-muted">{t("move.criteriaWillCreate")}</span>}
                        <input
                          type="text"
                          className="input w-24 py-0.5 px-1.5 text-xs font-mono"
                          placeholder={t("move.criteriaCardPlaceholder")}
                          value={criteriaCards[i] ?? ""}
                          onChange={(e) => setCritCard(i, e.target.value.toUpperCase())}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {/* «Что изменилось для людей» — для review (опционально) и done (обязательно для код-задач) */}
          {(to === "done" || to === "review") && isCode && (
            <div>
              <label className="label">{t("move.whatChangedLabel")}</label>
              <textarea
                className="input min-h-16 py-2 text-sm"
                value={whatChanged}
                onChange={(e) => setWhatChanged(e.target.value)}
                placeholder={t("move.whatChangedPlaceholder")}
              />
            </div>
          )}
          {needsClosingMap && (
            <div>
              <label className="label">{t("intake.closingMapLabel")}</label>
              <textarea
                className="input resize-y py-2 text-sm"
                rows={4}
                value={closingMap}
                onChange={(e) => setClosingMap(e.target.value)}
                placeholder={t("intake.closingMapPh")}
              />
            </div>
          )}
          <div>
            <label className="label">{label}</label>
            <textarea className="input min-h-20 py-2 text-sm" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            {t("move.force")}
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={pending || doneBlocked} onClick={() => submit(to)}>
              → {STATUSES[to]}
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

/** Одна кнопка перехода без формы: «В очереди» у готовой по чек-листу задачи, «Вернуть в очередь» у брошенной */
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
