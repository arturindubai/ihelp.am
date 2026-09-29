"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { renderOwnerText } from "@/lib/cc-owner-q-render";
import { useTranslations } from "next-intl";
import { Mic, MicOff, Paperclip, Play, Sparkles, Square, X } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  ccApproveManyAction,
  ccApproveMockupAction,
  ccCommentAction,
  ccReturnDesignAction,
  ccMessageToIntakeAction,
  ccOwnerAnswerAction,
  ccOwnerAnswerManyAction,
  ccOwnerPostpone3DaysAction,
  ccOwnerPostponeAction,
  ccReadAllMessagesAction,
  ccReadMessageAction,
  ccRejectManyAction,
  ccReturnManyAction,
  ccRunWorkerAction,
  ccSendMessageAction,
  ccStopRunAction,
  ccTransitionAction,
} from "@/server/actions/admin/cc";
import { cn } from "@/lib/format";
import { parseVariants } from "@/lib/cc-owner-q";

/** Кнопки и формы пульта Control Center: Intake, запуск и остановка воркеров, согласования, сообщения */

/** Ошибка вызова серверного действия: после выкладки — «сайт обновился», иначе текст ошибки */
function staleOrError(e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  return /server action|Failed to find|not found|failed to fetch|NetworkError|Load failed/i.test(msg) ? "stale" : msg.slice(0, 120);
}

const DRAFT_KEY = "cc-intake-draft";
const readDraft = () => {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
};
const writeDraft = (v: string) => {
  try {
    if (v.trim()) localStorage.setItem(DRAFT_KEY, v);
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* приватный режим — без черновика */
  }
};

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      // Серверное действие может упасть целиком (после выкладки старая страница его не найдёт) — не роняем страницу
      const r = await fn().catch((e: unknown) => ({ ok: false, error: staleOrError(e) }));
      if (!r.ok) return setError(r.error ?? "error");
      setDone(true);
      setTimeout(() => setDone(false), 2500);
      after?.();
      router.refresh();
    });
  return { pending, error, done, run };
}

/* ───────────── Intake ───────────── */

type IntakeItem = { key: string; title: string; status: string; triagedAt: string | Date | null; triageNote: string | null; createdAt: string | Date; inWork?: boolean };

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};

/**
 * Intake, как в LIA: описать работу свободным текстом (или голосом, с файлами) — карточка IN-N уходит в очередь триажа.
 * Триаж-воркер перепишет её в настоящую задачу, спросит, чего не хватает, или отложит. Ниже — очередь и история
 */
export function IntakeButton({ history }: { history: IntakeItem[] }) {
  const t = useTranslations("admin.cc.intake");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Черновик живёт в браузере: выкладка, случайное закрытие окна или ошибка не стирают набранное
  const wantStop = useRef(false);
  const [pending, start] = useTransition();
  const [retryAttempt, setRetryAttempt] = useState(0);
  const rec = useRef<SpeechRec | null>(null);
  const router = useRouter();
  const [speech, setSpeech] = useState(false);
  // true когда при загрузке страницы в localStorage был черновик — показываем индикатор на кнопке
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    setSpeech(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    const draft = readDraft();
    if (draft) {
      setText(draft);
      setHasDraft(true);
    }
  }, []);

  // Предупреждаем браузером перед закрытием/обновлением страницы, если в форме есть текст или идёт отправка
  useEffect(() => {
    const needsWarn = (open && text.trim().length > 0) || pending;
    if (!needsWarn) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [open, text, pending]);

  const edit = (v: string) => {
    setText(v);
    writeDraft(v);
  };

  const toggleVoice = () => {
    if (listening) {
      wantStop.current = true;
      return rec.current?.stop();
    }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return setVoiceError(t("voiceErrors.unsupported"));
    setVoiceError(null);
    wantStop.current = false;
    const r = new Ctor();
    r.lang = document.documentElement.lang === "en" ? "en-US" : "ru-RU";
    r.continuous = true;
    // Промежуточный текст виден сразу — понятно, что микрофон слышит
    r.interimResults = true;
    r.onresult = (e) => {
      let finalChunk = "";
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalChunk += e.results[i][0].transcript;
        else live += e.results[i][0].transcript;
      }
      setInterim(live);
      if (finalChunk)
        setText((prev) => {
          const next = `${prev}${prev && !prev.endsWith(" ") ? " " : ""}${finalChunk.trim()}`;
          writeDraft(next);
          return next;
        });
    };
    r.onerror = (e) => {
      const code = e.error ?? "unknown";
      // «no-speech» и «aborted» — не ошибки: просто тишина или остановка
      if (code === "no-speech" || code === "aborted") return;
      wantStop.current = true;
      setVoiceError(t(code === "not-allowed" || code === "service-not-allowed" ? "voiceErrors.notAllowed" : code === "network" ? "voiceErrors.network" : "voiceErrors.other", { code }));
    };
    // Браузер сам обрывает распознавание через несколько секунд тишины — продолжаем, пока человек не нажал «Остановить»
    r.onend = () => {
      setInterim("");
      if (!wantStop.current) {
        try {
          r.start();
          return;
        } catch {
          /* не удалось продолжить — остановимся */
        }
      }
      setListening(false);
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setVoiceError(t("voiceErrors.other", { code: "start" }));
    }
  };

  const send = () =>
    start(async () => {
      setError(null);
      setRetryAttempt(0);
      // Постоянный маршрут /api/cc/intake работает из старой вкладки после выкладки,
      // в отличие от Server Action. При 5xx сервер ещё перезапускается — повторяем до 3 раз.
      type IntakeResult = { ok: true; key: string } | { ok: false; error: string };
      let r: IntakeResult = { ok: false, error: "stale" };
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (attempt > 1) {
          setRetryAttempt(attempt);
          await new Promise<void>((res) => setTimeout(res, 3000 * (attempt - 1)));
        }
        try {
          const resp = await fetch("/api/cc/intake", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });
          const data = (await resp.json()) as IntakeResult;
          if (resp.ok || resp.status < 500) { r = data; break; }
          // 5xx — сервер перезапускается: пробуем ещё раз
          r = data;
        } catch {
          // Сеть недоступна — пробуем ещё раз
        }
      }
      setRetryAttempt(0);
      if (!r.ok) return setError(t(r.error === "too_short" ? "tooShort" : "error"));
      for (const f of files) {
        const form = new FormData();
        form.set("file", f);
        form.set("taskKey", r.key);
        await fetch("/api/cc/upload", { method: "POST", body: form }).catch(() => null);
      }
      wantStop.current = true;
      rec.current?.stop();
      setText("");
      writeDraft("");
      setFiles([]);
      setHasDraft(false);
      setSent(r.key);
      router.refresh();
    });

  const stateOf = (i: IntakeItem) => (i.status === "cancelled" ? "converted" : i.triagedAt ? "triaged" : i.inWork ? "inWork" : "queued");

  return (
    <>
      <button className="btn-primary btn-sm relative gap-1.5" onClick={() => (setOpen(true), setSent(null))}>
        <Sparkles size={15} /> {t("button")}
        {hasDraft && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-warn" aria-label={t("draftBadge")} />}
      </button>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-overlay/40" onClick={() => setOpen(false)} aria-label={t("close")} />
          <div className="absolute inset-x-0 top-0 mx-auto max-h-dvh w-full max-w-2xl overflow-y-auto bg-paper p-4 shadow-xl sm:top-10 sm:rounded-2xl sm:p-6">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold">{t("title")}</div>
                <div className="text-xs text-muted">{t("hint")}</div>
              </div>
              <button className="btn-ghost btn-sm px-2" onClick={() => setOpen(false)} aria-label={t("close")}>
                <X size={18} />
              </button>
            </div>
            <textarea className="input min-h-40 w-full" value={text} onChange={(e) => edit(e.target.value)} placeholder={t("placeholder")} autoFocus />
            {hasDraft && !sent && <p className="mt-1 rounded-lg bg-warn-50 px-3 py-1.5 text-xs text-warn">{t("draftRestored")}</p>}
            {listening && <p className="mt-1 text-xs text-muted">🎙 {interim || t("listening")}</p>}
            {voiceError && <p className="mt-1 rounded-lg bg-warn-50 px-3 py-1.5 text-xs text-warn">{voiceError}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {speech && (
                <button type="button" className={cn("btn-sm gap-1.5", listening ? "btn-danger" : "btn-outline")} onClick={toggleVoice}>
                  {listening ? <MicOff size={15} /> : <Mic size={15} />} {listening ? t("voiceStop") : t("voice")}
                </button>
              )}
              <label className="btn-outline btn-sm cursor-pointer gap-1.5">
                <Paperclip size={15} /> {t("attach")}
                <input type="file" multiple className="hidden" accept="image/*,application/pdf" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 6))} />
              </label>
              {files.map((f, i) => (
                <span key={i} className="chip bg-surface text-xs">
                  {f.name}
                  <button className="ml-1 text-muted" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={t("remove")}>
                    ×
                  </button>
                </span>
              ))}
              <span className="flex-1" />
              <button className="btn-primary btn-sm" disabled={pending || text.trim().length < 10} onClick={send}>
                {pending ? (retryAttempt > 1 ? t("retrying", { n: retryAttempt }) : t("sending")) : t("send")}
              </button>
            </div>
            {error && <p className="mt-2 rounded-lg bg-bad-50 px-3 py-2 text-xs text-bad">{error}</p>}
            {sent && (
              <p className="mt-2 rounded-lg bg-ok-50 px-3 py-2 text-sm text-ok">
                {t("sent", { key: sent })}{" "}
                <Link href={`/admin/control?task=${sent}`} className="underline" onClick={() => setOpen(false)}>
                  {t("open")}
                </Link>
              </p>
            )}
            <div className="mt-5">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{t("history")}</div>
              {history.length === 0 && <p className="text-xs text-muted">{t("empty")}</p>}
              <ul className="divide-y divide-line text-sm">
                {history.map((i) => (
                  <li key={i.key} className="py-1.5">
                    <Link href={`/admin/control?task=${i.key}`} className="flex items-baseline gap-2 hover:underline" onClick={() => setOpen(false)}>
                      <span className="font-mono text-xs text-muted">{i.key}</span>
                      <span className="min-w-0 flex-1 truncate">{i.title}</span>
                      <span className={cn("chip shrink-0 text-[10px]", stateOf(i) === "queued" ? "bg-warn-50 text-warn" : stateOf(i) === "inWork" ? "bg-brand-50 text-brand" : "bg-ok-50 text-ok")}>{t(`states.${stateOf(i)}`)}</span>
                    </Link>
                    {i.triageNote && <p className="ml-14 line-clamp-2 text-xs text-muted">{i.triageNote}</p>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ───────────── Воркеры ───────────── */

/** «▶ Запустить воркера» / «Запустить сейчас»: диспетчер запустит пул на ближайшем проходе (до минуты) */
export function RunWorkerButton({ pool, taskKey, label, small }: { pool: string; taskKey?: string; label: string; small?: boolean }) {
  const t = useTranslations("admin.cc.workers");
  const { pending, error, done, run } = useAct();
  return (
    <span className="inline-flex flex-col items-start">
      <button className={cn(small ? "btn-outline btn-sm" : "btn-primary btn-sm", "gap-1.5")} disabled={pending || done} onClick={() => run(() => ccRunWorkerAction(pool, taskKey ?? null))}>
        <Play size={14} /> {done ? t("requested") : label}
      </button>
      {error && <span className="mt-1 text-xs text-bad">{t("requestFailed")}</span>}
    </span>
  );
}

export function StopRunButton({ runId }: { runId: string }) {
  const t = useTranslations("admin.cc.workers");
  const { pending, done, run } = useAct();
  return (
    <button className="btn-danger btn-sm gap-1" disabled={pending || done} onClick={() => confirm(t("stopConfirm")) && run(() => ccStopRunAction(runId))}>
      <Square size={12} /> {done ? t("stopping") : t("stop")}
    </button>
  );
}

/** Строка журнала запусков: итог, а по клику — хвост лога запуска */
export function RunLog({ summary, log }: { summary: string | null; log: string | null }) {
  const t = useTranslations("admin.cc.workers");
  const [open, setOpen] = useState(false);
  if (!summary && !log) return null;
  return (
    <div className="mt-1">
      {summary && <p className={cn("whitespace-pre-line text-xs text-muted", !open && "line-clamp-2")}>{summary}</p>}
      {log && (
        <button className="mt-0.5 text-xs text-brand hover:underline" onClick={() => setOpen(!open)}>
          {open ? t("hideLog") : t("showLog")}
        </button>
      )}
      {open && log && <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-2 text-[11px] leading-snug">{log}</pre>}
    </div>
  );
}

/* ───────────── Согласования ───────────── */

/** Принять (закрыть с отметкой), вернуть на доработку или отклонить — с причиной словами */
export function ApprovalButtons({ taskKey }: { taskKey: string }) {
  const t = useTranslations("admin.cc.approvals");
  const { pending, error, run } = useAct();
  const [mode, setMode] = useState<null | "ready" | "cancelled">(null);
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap gap-1.5">
        <button className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => ccTransitionAction(taskKey, { to: "done", text: t("approvedText") }))}>
          {t("approve")}
        </button>
        <button className="btn-outline btn-sm" disabled={pending} onClick={() => setMode(mode === "ready" ? null : "ready")}>
          {t("return")}
        </button>
        <button className="btn-ghost btn-sm text-bad" disabled={pending} onClick={() => setMode(mode === "cancelled" ? null : "cancelled")}>
          {t("reject")}
        </button>
      </div>
      {mode && (
        <form
          className="flex w-full max-w-sm gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => ccTransitionAction(taskKey, { to: mode, text: reason }), () => (setMode(null), setReason("")));
          }}
        >
          <input className="input h-9 flex-1 py-1 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === "ready" ? t("returnPh") : t("rejectPh")} autoFocus />
          <button className="btn-dark btn-sm" disabled={pending || reason.trim().length < 5}>
            {t("ok")}
          </button>
        </form>
      )}
      {error && <span className="text-xs text-bad">{t("failed", { error })}</span>}
    </div>
  );
}

export function ApproveAllButton({ keys, label }: { keys: string[]; label: string }) {
  const t = useTranslations("admin.cc.approvals");
  const { pending, run } = useAct();
  const [result, setResult] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className="btn-outline btn-sm"
        disabled={pending || keys.length === 0}
        onClick={() =>
          confirm(t("approveAllConfirm", { n: keys.length })) &&
          run(async () => {
            const r = await ccApproveManyAction(keys);
            if (r.ok && r.failed.length) setResult(t("approveAllFailed", { keys: r.failed.join(", ") }));
            return r;
          })
        }
      >
        {label}
      </button>
      {result && <span className="text-xs text-warn">{result}</span>}
    </span>
  );
}

/** Добавить комментарий в ленту задачи без смены статуса (как note у разработчика) */
export function CommentButton({ taskKey }: { taskKey: string }) {
  const t = useTranslations("admin.cc.approvals");
  const { pending, error, done, run } = useAct();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col items-end gap-1">
      <button className="btn-outline btn-sm" disabled={pending} onClick={() => setOpen(!open)}>
        {done ? t("commentDone") : t("comment")}
      </button>
      {open && (
        <form
          className="flex w-full max-w-sm gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => ccCommentAction(taskKey, text), () => (setOpen(false), setText("")));
          }}
        >
          <input className="input h-9 flex-1 py-1 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("commentPh")} autoFocus />
          <button className="btn-dark btn-sm" disabled={pending || text.trim().length < 2}>
            {t("ok")}
          </button>
        </form>
      )}
      {error && <span className="text-xs text-bad">{t("failed", { error })}</span>}
    </div>
  );
}

/* ───────────── Макет ───────────── */

/**
 * Утвердить макет задачи: показывает открытые вопросы (needs), даёт отметить закрытые.
 * Если все вопросы сняты — задача возвращается туда, откуда была заблокирована.
 */
export function MockupApproveButton({ taskKey, needs = [] }: { taskKey: string; needs?: string[] }) {
  const t = useTranslations("admin.cc.mockup");
  const { pending, error, done, run } = useAct();
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  // Открытые вопросы, которые владелец отметит как закрытые при утверждении
  const [closed, setClosed] = useState<Set<string>>(new Set());
  if (done) return <p className="text-xs text-ok">{t("approved")}</p>;
  const toggleNeed = (n: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });
  return (
    <div className="flex flex-col items-end gap-1">
      {!showComment ? (
        <button className="btn-primary btn-sm" disabled={pending} onClick={() => setShowComment(true)}>
          {t("approve")}
        </button>
      ) : (
        <form
          className="flex w-full max-w-sm flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => ccApproveMockupAction(taskKey, comment, closed.size > 0 ? [...closed] : undefined),
              () => { setShowComment(false); setComment(""); setClosed(new Set()); },
            );
          }}
        >
          {needs.length > 0 && (
            <div className="mb-1 space-y-1 text-xs">
              <p className="font-medium text-warn">{t("needsOpen")}</p>
              {needs.map((n) => (
                <label key={n} className="flex cursor-pointer items-start gap-1.5">
                  <input type="checkbox" className="mt-0.5 shrink-0" checked={closed.has(n)} onChange={() => toggleNeed(n)} />
                  <span className={closed.has(n) ? "text-muted line-through" : ""}>{n}</span>
                </label>
              ))}
            </div>
          )}
          <input className="input h-9 w-full py-1 text-sm" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("commentPh")} autoFocus={needs.length === 0} />
          <div className="flex gap-1.5">
            <button className="btn-primary btn-sm" disabled={pending}>{t("confirm")}</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setShowComment(false)}>{t("cancel")}</button>
          </div>
        </form>
      )}
      {error && <span className="text-xs text-bad">{t("failed", { error })}</span>}
    </div>
  );
}

/** «Вернуть все» по дорожке: запрашивает причину через inline-форму, затем возвращает каждую задачу */
export function ReturnAllButton({ keys, label }: { keys: string[]; label: string }) {
  const t = useTranslations("admin.cc.approvals");
  const { pending, run } = useAct();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button className="btn-outline btn-sm" disabled={pending || keys.length === 0} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              async () => {
                const r = await ccReturnManyAction(keys, reason);
                if (r.ok && r.failed.length) setResult(t("returnAllFailed", { keys: r.failed.join(", ") }));
                return r;
              },
              () => (setOpen(false), setReason("")),
            );
          }}
        >
          <input className="input h-9 w-40 py-1 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("returnAllPh")} autoFocus />
          <button className="btn-dark btn-sm" disabled={pending || reason.trim().length < 5}>
            {t("ok")}
          </button>
        </form>
      )}
      {result && <span className="text-xs text-warn">{result}</span>}
    </span>
  );
}

/** «Отклонить все» по дорожке: запрашивает причину через inline-форму, затем отклоняет каждую задачу */
export function RejectAllButton({ keys, label }: { keys: string[]; label: string }) {
  const t = useTranslations("admin.cc.approvals");
  const { pending, run } = useAct();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button className="btn-ghost btn-sm text-bad" disabled={pending || keys.length === 0} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              async () => {
                const r = await ccRejectManyAction(keys, reason);
                if (r.ok && r.failed.length) setResult(t("rejectAllFailed", { keys: r.failed.join(", ") }));
                return r;
              },
              () => (setOpen(false), setReason("")),
            );
          }}
        >
          <input className="input h-9 w-40 py-1 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("rejectAllPh")} autoFocus />
          <button className="btn-danger btn-sm" disabled={pending || reason.trim().length < 5}>
            {t("ok")}
          </button>
        </form>
      )}
      {result && <span className="text-xs text-warn">{result}</span>}
    </span>
  );
}

/** Вернуть дизайн дизайнеру с причиной: задача уходит в блокировку «на дизайне» */
export function DesignReturnButton({ taskKey }: { taskKey: string }) {
  const t = useTranslations("admin.cc.mockup");
  const { pending, error, done, run } = useAct();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sentReason, setSentReason] = useState("");
  if (done) return (
    <div className="flex max-w-sm flex-col items-end gap-1">
      <span className="chip bg-warn-50 text-warn">{t("returned")}</span>
      {sentReason && (
        <span className="line-clamp-1 text-xs text-muted" title={sentReason}>
          {sentReason.length > 60 ? sentReason.slice(0, 60) + "…" : sentReason}
        </span>
      )}
    </div>
  );
  return (
    <div className="flex flex-col items-end gap-1">
      {!open ? (
        <button className="btn-outline btn-sm" disabled={pending} onClick={() => setOpen(true)}>
          {t("return")}
        </button>
      ) : (
        <form
          className="flex w-full max-w-sm gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            setSentReason(reason);
            run(() => ccReturnDesignAction(taskKey, reason), () => setOpen(false));
          }}
        >
          <input className="input h-9 flex-1 py-1 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("returnPh")} autoFocus />
          <button className="btn-dark btn-sm" disabled={pending || reason.trim().length < 5}>{t("confirm")}</button>
        </form>
      )}
      {error && <span className="text-xs text-bad">{t("failed", { error })}</span>}
    </div>
  );
}

/* ───────────── Вопросы владельцу ───────────── */

/** Компактная карточка вопроса с вариантами (A/B/C) или полем ввода — в «Нужен ты» */
export function OwnerQuestionCard({ taskKey, title, blockedReason, taskHref }: { taskKey: string; title: string; blockedReason: string | null; taskHref: string }) {
  const t = useTranslations("admin.cc.you");
  const { pending, error, run } = useAct();
  const [expanded, setExpanded] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [postponeOpen, setPostponeOpen] = useState(false);
  const [postponeReason, setPostponeReason] = useState("");
  const [postponeDate, setPostponeDate] = useState("");

  if (answered) return null;

  const parsed = blockedReason ? parseVariants(blockedReason) : null;
  const question = parsed?.question || blockedReason || "";

  const answer = (text: string) => run(() => ccOwnerAnswerAction(taskKey, text), () => setAnswered(true));
  const postpone = () =>
    run(
      () => ccOwnerPostponeAction(taskKey, postponeDate, postponeReason || undefined),
      () => { setAnswered(true); setPostponeOpen(false); setPostponeReason(""); setPostponeDate(""); },
    );

  return (
    <li className="space-y-2 py-3">
      <Link href={taskHref} scroll={false} className="flex items-baseline gap-2">
        <span className="shrink-0 font-mono text-xs text-muted">{taskKey}</span>
        <span className="font-medium">{title}</span>
      </Link>
      {question && (
        <div className="text-sm">
          <p className={cn("text-warn", !expanded && "line-clamp-2")}>{question}</p>
          {question.length > 120 && (
            <button className="mt-0.5 text-xs text-brand hover:underline" onClick={() => setExpanded(!expanded)}>
              {expanded ? t("collapse") : t("expand")}
            </button>
          )}
        </div>
      )}
      {parsed ? (
        <div className="flex flex-wrap gap-1.5">
          {parsed.variants.map((v) => (
            <button
              key={v.id}
              disabled={pending}
              className="rounded-lg border border-line bg-paper px-3 py-1 text-sm transition-colors hover:border-brand hover:bg-brand hover:text-on-action disabled:opacity-50"
              onClick={() => answer(t("answerVariant", { id: v.id }))}
            >
              {v.id}) {v.text}
            </button>
          ))}
          <button className="btn-ghost btn-sm text-muted" disabled={pending} onClick={() => setPostponeOpen(!postponeOpen)}>
            {t("postpone")}
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              answer(replyText);
            }}
          >
            <input className="input h-9 flex-1 py-1 text-sm" value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder={t("replyPh")} autoFocus />
            <button className="btn-dark btn-sm" disabled={pending || replyText.trim().length < 2}>
              {t("replySend")}
            </button>
          </form>
          <button className="btn-ghost btn-sm text-muted" disabled={pending} onClick={() => setPostponeOpen(!postponeOpen)}>
            {t("postpone")}
          </button>
        </div>
      )}
      {postponeOpen && (
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            postpone();
          }}
        >
          <div className="flex gap-1.5">
            <input
              type="date"
              className="input h-9 w-40 py-1 text-sm"
              value={postponeDate}
              onChange={(e) => setPostponeDate(e.target.value)}
              min={new Date(Date.now() + 86400_000).toISOString().slice(0, 10)}
              required
              placeholder={t("postponeDatePh")}
            />
            <input className="input h-9 flex-1 py-1 text-sm" value={postponeReason} onChange={(e) => setPostponeReason(e.target.value)} placeholder={t("postponePh")} />
          </div>
          <div className="flex gap-1.5">
            <button className="btn-outline btn-sm" disabled={pending || !postponeDate}>
              {t("postponeConfirm")}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setPostponeOpen(false)}>
              ×
            </button>
          </div>
        </form>
      )}
      {error && <p className="text-xs text-bad">{error}</p>}
    </li>
  );
}

/* ───────────── Сообщения ───────────── */

/** Кнопка «Прочитать всё»: отмечает непрочитанными все уведомления владельца за один клик */
export function MarkAllReadButton({ unreadCount }: { unreadCount: number }) {
  const t = useTranslations("admin.cc.notify");
  const { pending, error, done, run } = useAct();
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        className="btn-outline btn-sm"
        disabled={pending || unreadCount === 0}
        onClick={() => run(() => ccReadAllMessagesAction())}
      >
        {pending && <span className="mr-1 inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        {done ? t("markAllReadDone") : t("markAllRead")}
      </button>
      {error && <p className="text-xs text-bad">{t("failed")}</p>}
    </div>
  );
}

export function MessageComposer({ roles, initialTo = "workers", taskKey }: { roles: readonly string[]; initialTo?: string; taskKey?: string }) {
  const t = useTranslations("admin.cc.notify");
  const [to, setTo] = useState(initialTo);
  const [text, setText] = useState("");
  const { pending, error, done, run } = useAct();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => ccSendMessageAction({ to: to as "workers", text, taskKey: taskKey ?? null }), () => setText(""));
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">{t("to")}</span>
        <select className="input h-9 w-auto py-1 text-sm" value={to} onChange={(e) => setTo(e.target.value)}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {t(`roles.${r}` as "roles.owner")}
            </option>
          ))}
        </select>
      </div>
      <textarea className="input min-h-20 w-full" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("placeholder")} />
      <div className="flex items-center gap-2">
        <button className="btn-primary btn-sm" disabled={pending || text.trim().length < 2}>
          {done ? t("sent") : t("send")}
        </button>
        <span className="text-xs text-muted">{t("composeHint")}</span>
      </div>
      {error && <p className="text-xs text-bad">{t("failed")}</p>}
    </form>
  );
}

/**
 * Кнопки под уведомлением. notifyOnly=true: показывает только «Прочитано» (без «Ответить» и «В бэклог»).
 * Используется в NotifyTab, где уведомления не требуют действий кроме отметки прочитанным.
 */
export function MessageActions({ id, unread, replyTo, notifyOnly }: { id: string; unread: boolean; replyTo: string | null; notifyOnly?: boolean }) {
  const t = useTranslations("admin.cc.notify");
  const { pending, run } = useAct();
  const [reply, setReply] = useState(false);
  const [text, setText] = useState("");
  const router = useRouter();
  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap gap-1.5">
        {unread && (
          <button className="btn-outline btn-sm" disabled={pending} onClick={() => run(() => ccReadMessageAction(id))}>
            {t("read")}
          </button>
        )}
        {!notifyOnly && (
          <button
            className="btn-outline btn-sm"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await ccMessageToIntakeAction(id);
                if (r.ok) router.push(`/admin/control?task=${r.key}`);
                return r;
              })
            }
          >
            {t("toBacklog")}
          </button>
        )}
        {!notifyOnly && replyTo && (
          <button className="btn-ghost btn-sm" onClick={() => setReply(!reply)}>
            {t("reply")}
          </button>
        )}
      </div>
      {reply && replyTo && !notifyOnly && (
        <form
          className="mt-1.5 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              async () => {
                const r = await ccSendMessageAction({ to: replyTo as "workers", text });
                if (r.ok) await ccReadMessageAction(id);
                return r;
              },
              () => (setReply(false), setText("")),
            );
          }}
        >
          <input className="input h-9 flex-1 py-1 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("replyPh")} autoFocus />
          <button className="btn-dark btn-sm" disabled={pending || text.trim().length < 2}>
            {t("send")}
          </button>
        </form>
      )}
    </div>
  );
}

/* ───────────── Вкладка «Нужен ты»: интерактивная часть ───────────── */

export type YouCardTask = { key: string; title: string; href: string; priority: string };
export type YouCard = {
  id: string;
  question: string;
  groupType: "variant" | "price" | "data" | "auth" | "approve" | "rule" | "other";
  tasks: YouCardTask[];
  variants: { id: string; text: string }[] | null;
  multiQuestion: { question: string; variants: { id: string; text: string }[] | null }[] | null;
  isUrgent: boolean;
  textMayCut: boolean;
  /** Ссылка на задачу-оригинал при уведомлении о дубле */
  origTaskHref?: string;
  /** Ключ задачи-оригинала для отображения в ссылке */
  origTaskKey?: string;
  /** Сколько задач разблокирует ответ на этот вопрос */
  unblocksCount?: number;
};
export type YouPostponedTask = {
  key: string;
  title: string;
  href: string;
  priority: string;
  reason: string | null;
  updatedAt: string;
};

const GROUP_ICONS: Record<YouCard["groupType"], string> = {
  variant: "🗳️",
  price: "💰",
  data: "📎",
  auth: "🔑",
  approve: "✅",
  rule: "📋",
  other: "💬",
};

/** Один блок вопроса с вариантами или текстовым вводом */
function QuestionBlock({
  block,
  blockIdx,
  blockCount,
  pending,
  onAnswer,
}: {
  block: { question: string; variants: { id: string; text: string }[] | null };
  blockIdx: number;
  blockCount: number;
  pending: boolean;
  onAnswer: (text: string) => void;
}) {
  const t = useTranslations("admin.cc.you");
  const [replyText, setReplyText] = useState("");

  return (
    <div>
      {block.question && (
        <div className="mb-2 text-sm font-medium">
          {blockCount > 1 && <span className="mr-1 text-muted">{blockIdx + 1}.</span>}
          {renderOwnerText(block.question, t("devOnly"))}
        </div>
      )}
      {block.variants ? (
        <div className="flex flex-wrap gap-2">
          {block.variants.map((v) => (
            <button
              key={v.id}
              disabled={pending}
              className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors hover:bg-brand hover:text-inverse disabled:opacity-50"
              onClick={() => onAnswer(blockCount > 1 ? `[Вопрос ${blockIdx + 1}] ${t("answerVariant", { id: v.id })}` : t("answerVariant", { id: v.id }))}
            >
              {v.id}) {v.text}
            </button>
          ))}
        </div>
      ) : (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            onAnswer(replyText);
          }}
        >
          <input
            className="input h-9 flex-1 py-1 text-sm"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={t("replyPh")}
          />
          <button className="btn-primary btn-sm" disabled={pending || replyText.trim().length < 2}>
            {t("replySend")}
          </button>
        </form>
      )}
    </div>
  );
}

/** Карточка одного вопроса: полный текст, чипы задач, кнопки вариантов или ввод текста, «Отложить на 3 дня» */
function YouQuestionCard({ card, onDone }: { card: YouCard; onDone: (id: string) => void }) {
  const t = useTranslations("admin.cc.you");
  const { pending, error, run } = useAct();
  const [visible, setVisible] = useState(true);
  const [hiddenBlocks, setHiddenBlocks] = useState<Set<number>>(new Set());

  const answer = (text: string, blockIdx?: number) =>
    run(() => ccOwnerAnswerManyAction(card.tasks.map((x) => x.key), text), () => {
      if (blockIdx !== undefined && card.multiQuestion && card.multiQuestion.length > 1) {
        setHiddenBlocks((prev) => new Set([...prev, blockIdx]));
        if (hiddenBlocks.size + 1 >= card.multiQuestion.length) {
          setVisible(false);
          setTimeout(() => onDone(card.id), 300);
        }
      } else {
        setVisible(false);
        setTimeout(() => onDone(card.id), 300);
      }
    });

  const postpone = () =>
    run(() => ccOwnerPostpone3DaysAction(card.tasks.map((x) => x.key)), () => {
      setVisible(false);
      setTimeout(() => onDone(card.id), 300);
    });

  const blocks = card.multiQuestion ?? [{ question: card.question, variants: card.variants }];
  const visibleBlocks = blocks.filter((_, idx) => !hiddenBlocks.has(idx));

  return (
    <div
      className={cn(
        "rounded-card border bg-paper p-4 transition-all duration-300",
        card.isUrgent ? "border-bad-50 bg-bad-50/20" : "border-line",
        !visible && "pointer-events-none scale-95 opacity-0",
      )}
    >
      {card.isUrgent && (
        <span className="chip mb-2 inline-block bg-bad-50 text-[10px] text-bad">{t("urgent")}</span>
      )}
      {card.textMayCut && (
        <p className="mb-2 text-xs text-warn">{t("textMayCut")}</p>
      )}
      {card.origTaskHref && card.origTaskKey && (
        <p className="mb-2 text-sm">
          <Link href={card.origTaskHref} scroll={false} className="font-mono text-brand hover:underline">
            {card.origTaskKey}
          </Link>
        </p>
      )}
      {card.tasks.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {card.tasks.map((task) => (
            <Link key={task.key} href={task.href} scroll={false} className="chip bg-surface text-[11px] hover:bg-brand-50 hover:text-brand">
              {task.key}
            </Link>
          ))}
        </div>
      )}
      {(card.unblocksCount ?? 0) >= 1 && (
        <p className="mb-2">
          <span className="chip bg-brand-50 text-xs text-brand">{t("unblocks", { n: card.unblocksCount ?? 0 })}</span>
        </p>
      )}
      <div className="space-y-4">
        {visibleBlocks.map((block) => {
          const blockIdx = blocks.indexOf(block);
          return (
            <QuestionBlock
              key={blockIdx}
              block={block}
              blockIdx={blockIdx}
              blockCount={blocks.length}
              pending={pending}
              onAnswer={(text) => answer(text, blockIdx)}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-end">
        <button className="btn-ghost btn-sm text-muted" disabled={pending} onClick={postpone}>
          {t("postpone3days")}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}

/**
 * Интерактивная секция вопросов во вкладке «Нужен ты»: фильтры, группы, карточки.
 * Принимает сериализованные данные от серверного компонента YouTab.
 */
export function YouQuestionsSection({
  cards,
  postponed,
  nocodeReviewCount = 0,
}: {
  cards: YouCard[];
  postponed: YouPostponedTask[];
  nocodeReviewCount?: number;
}) {
  const t = useTranslations("admin.cc.you");
  const [filter, setFilter] = useState<"all" | "urgent" | "postponed">("all");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const hide = (id: string) => setHidden((prev) => new Set([...prev, id]));
  const visibleCards = cards.filter((c) => !hidden.has(c.id));
  const urgentCards = visibleCards.filter((c) => c.isUrgent);
  const activeCount = visibleCards.length;
  const urgentCount = urgentCards.length;
  const postponedCount = postponed.length;

  const displayCards = filter === "urgent" ? urgentCards : filter === "postponed" ? [] : visibleCards;

  const byGroup = (
    [
      ["variant", displayCards.filter((c) => c.groupType === "variant")],
      ["price", displayCards.filter((c) => c.groupType === "price")],
      ["data", displayCards.filter((c) => c.groupType === "data")],
      ["auth", displayCards.filter((c) => c.groupType === "auth")],
      ["approve", displayCards.filter((c) => c.groupType === "approve")],
      ["rule", displayCards.filter((c) => c.groupType === "rule")],
      ["other", displayCards.filter((c) => c.groupType === "other")],
    ] as [YouCard["groupType"], YouCard[]][]
  ).filter(([, g]) => g.length > 0);

  const allEmpty = activeCount === 0 && postponedCount === 0;

  const headerText = (() => {
    if (allEmpty && nocodeReviewCount === 0) return t("allDone");
    if (nocodeReviewCount > 0 && activeCount > 0) return t("headerWithReview", { q: activeCount, m: nocodeReviewCount });
    if (nocodeReviewCount > 0) return t("headerReviewOnly", { m: nocodeReviewCount });
    return t("headerCount", { n: activeCount });
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">
          {headerText}
        </h2>
      </div>

      {(activeCount > 0 || postponedCount > 0) && (
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["all", t("filterAll", { n: activeCount })] as const,
              ["urgent", t("filterUrgent", { n: urgentCount })] as const,
              ["postponed", t("filterPostponed", { n: postponedCount })] as const,
            ] as [typeof filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-lg px-3 py-1 text-sm transition-colors",
                filter === key ? "bg-brand text-inverse" : "bg-surface text-ink hover:bg-brand-50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {filter !== "postponed" && (
        <>
          {byGroup.length === 0 && activeCount === 0 && (
            <p className="py-6 text-center text-sm text-muted">{t("allDone")}</p>
          )}
          {byGroup.map(([groupType, groupCards]) => (
            <div key={groupType} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-base">{GROUP_ICONS[groupType]}</span>
                <span className="font-medium">{t(`groups.${groupType}`)}</span>
                <span className="chip bg-brand-50 text-[11px] text-brand">{groupCards.length}</span>
              </div>
              {groupCards.map((card) => (
                <YouQuestionCard key={card.id} card={card} onDone={hide} />
              ))}
            </div>
          ))}
        </>
      )}

      {filter === "postponed" && (
        <>
          {postponedCount === 0 && (
            <p className="py-6 text-center text-sm text-muted">{t("noPostponed")}</p>
          )}
          {postponedCount > 0 && (
            <p className="text-sm text-muted">{t("postponedSectionHint")}</p>
          )}
          <div className="space-y-2">
            {postponed.map((task) => (
              <div key={task.key} className="rounded-card border border-line bg-paper p-3 text-sm">
                <Link href={task.href} scroll={false} className="font-medium hover:underline">
                  <span className="mr-2 font-mono text-xs text-muted">{task.key}</span>
                  {task.title}
                </Link>
                {task.reason && <p className="mt-1 text-xs text-muted">{task.reason}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
