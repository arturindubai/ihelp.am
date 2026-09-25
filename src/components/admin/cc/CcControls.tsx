"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Mic, MicOff, Paperclip, Play, Sparkles, Square, X } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  ccApproveManyAction,
  ccIntakeAction,
  ccMessageToIntakeAction,
  ccReadMessageAction,
  ccRunWorkerAction,
  ccSendMessageAction,
  ccStopRunAction,
  ccTransitionAction,
} from "@/server/actions/admin/cc";
import { cn } from "@/lib/format";

/** Кнопки и формы пульта Control Center: Intake, запуск и остановка воркеров, согласования, сообщения */

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
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

type SpeechRec = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null };

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
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rec = useRef<SpeechRec | null>(null);
  const router = useRouter();
  const [speech, setSpeech] = useState(false);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    setSpeech(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const toggleVoice = () => {
    if (listening) return rec.current?.stop();
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = document.documentElement.lang === "en" ? "en-US" : "ru-RU";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let chunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) chunk += e.results[i][0].transcript;
      if (chunk) setText((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}${chunk.trim()}`);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };

  const send = () =>
    start(async () => {
      setError(null);
      const r = await ccIntakeAction(text);
      if (!r.ok) return setError(t(r.error === "too_short" ? "tooShort" : "error"));
      for (const f of files) {
        const form = new FormData();
        form.set("file", f);
        form.set("taskKey", r.key);
        await fetch("/api/cc/upload", { method: "POST", body: form }).catch(() => null);
      }
      rec.current?.stop();
      setText("");
      setFiles([]);
      setSent(r.key);
      router.refresh();
    });

  const stateOf = (i: IntakeItem) => (i.status === "cancelled" ? "converted" : i.triagedAt ? "triaged" : i.inWork ? "inWork" : "queued");

  return (
    <>
      <button className="btn-primary btn-sm gap-1.5" onClick={() => (setOpen(true), setSent(null))}>
        <Sparkles size={15} /> {t("button")}
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
            <textarea className="input min-h-40 w-full" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("placeholder")} autoFocus />
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
                {pending ? t("sending") : t("send")}
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

/* ───────────── Сообщения ───────────── */

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

export function MessageActions({ id, unread, replyTo }: { id: string; unread: boolean; replyTo: string | null }) {
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
        {replyTo && (
          <button className="btn-ghost btn-sm" onClick={() => setReply(!reply)}>
            {t("reply")}
          </button>
        )}
      </div>
      {reply && replyTo && (
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
