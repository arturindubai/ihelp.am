"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ccCommentAction, ccUpdateTaskAction } from "@/server/actions/admin/cc";
import { OWNERS, PRIORITIES, STAGES, STATUSES } from "@/lib/backlog-labels";
import { TextInput } from "@/components/admin/fields";
import { cn } from "@/lib/format";

const STATUS_SELECT_TONE: Record<string, string> = {
  backlog: "bg-surface text-ink",
  in_progress: "bg-brand-50 text-brand",
  review: "bg-warn-50 text-warn",
  blocked: "bg-bad-50 text-bad",
  done: "bg-ok-50 text-ok",
};

/** Быстрая смена статуса — цвет фона совпадает с бейджем статуса, чтобы читалось как бейдж, а не как форма */
export function TaskStatus({ taskKey, status, className }: { taskKey: string; status: string; className?: string }) {
  const [value, setValue] = useState(status);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <select
      className={cn("input min-h-8 w-auto border-transparent py-1 text-xs font-medium", STATUS_SELECT_TONE[value], className)}
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        start(async () => {
          await ccUpdateTaskAction(taskKey, { status: next });
          router.refresh();
        });
      }}
    >
      {Object.entries(STATUSES).map(([k, label]) => (
        <option key={k} value={k}>
          {label}
        </option>
      ))}
    </select>
  );
}

type Editable = { status: string; owner: string; priority: string; stage: string; assignee: string; blockedReason: string };

/** Панель управления задачей: статус, ответственный, приоритет, этап, причина блокировки */
export function TaskEditor({ taskKey, initial }: { taskKey: string; initial: Editable }) {
  const t = useTranslations("admin.cc");
  const [form, setForm] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const set = (patch: Partial<Editable>) => setForm((f) => ({ ...f, ...patch }));
  const select = (field: keyof Editable, options: Record<string, string>) => (
    <div>
      <label className="label">{t(field === "blockedReason" ? "blockedReason" : field)}</label>
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
      <div className="grid gap-3 sm:grid-cols-2">
        {select("status", STATUSES)}
        {select("owner", OWNERS)}
        {select("priority", PRIORITIES)}
        {select("stage", STAGES)}
        <TextInput label={t("assignee")} placeholder={t("assigneePh")} value={form.assignee} onChange={(v) => set({ assignee: v })} />
        {form.status === "blocked" && <TextInput label={t("blockedReason")} value={form.blockedReason} onChange={(v) => set({ blockedReason: v })} />}
      </div>
      <button
        className="btn-primary btn-sm"
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
