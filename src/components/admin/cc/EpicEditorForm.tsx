"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ccDeleteEpicAction, ccSaveEpicAction } from "@/server/actions/admin/cc";
import { EPIC_STATUSES } from "@/lib/backlog-labels";
import { TextInput } from "@/components/admin/fields";

export interface EpicFormValue {
  key: string;
  title: string;
  summary: string;
  requirements: string;
  design: string;
  techNotes: string;
  testingNotes: string;
  deployNotes: string;
  status: string;
  depends: string;
  docs: string;
}

export const EMPTY_EPIC: EpicFormValue = {
  key: "",
  title: "",
  summary: "",
  requirements: "",
  design: "",
  techNotes: "",
  testingNotes: "",
  deployNotes: "",
  status: "planned",
  depends: "",
  docs: "",
};

const toLines = (v: string) => v.split("\n").map((l) => l.trim()).filter(Boolean);

/** Форма эпика: создание нового и правка существующего. Правка переводит эпик на ручное ведение */
export function EpicEditorForm({ initial, isNew, canDelete }: { initial: EpicFormValue; isNew: boolean; canDelete?: boolean }) {
  const t = useTranslations("admin.cc");
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (patch: Partial<EpicFormValue>) => setV((x) => ({ ...x, ...patch }));

  const area = (field: keyof EpicFormValue, label: string, hint?: string, rows = 4) => (
    <div>
      <label className="label">{label}</label>
      <textarea className="input py-2" style={{ minHeight: rows * 28 }} value={v[field]} onChange={(e) => set({ [field]: e.target.value })} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );

  const save = () =>
    start(async () => {
      setError(null);
      const r = await ccSaveEpicAction(
        {
          key: v.key,
          title: v.title,
          summary: v.summary,
          requirements: toLines(v.requirements),
          design: v.design || null,
          techNotes: v.techNotes || null,
          testingNotes: v.testingNotes || null,
          deployNotes: v.deployNotes || null,
          status: v.status,
          depends: toLines(v.depends.replace(/,/g, "\n")),
          docs: toLines(v.docs),
        },
        isNew,
      );
      if (!r.ok) return setError(r.error);
      router.push(`/admin/control/epics/${r.key}`);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label={t("form.key")} value={v.key} onChange={(x) => set({ key: x.toLowerCase() })} hint={isNew ? t("form.epicKeyHint") : undefined} {...(isNew ? {} : { disabled: true })} />
        <TextInput label={t("form.title")} value={v.title} onChange={(x) => set({ title: x })} />
      </div>
      {area("summary", t("form.summary"), undefined, 3)}
      {area("requirements", t("form.requirements"), t("form.perLine"), 4)}
      <div className="grid gap-3 sm:grid-cols-3">
        {area("design", t("form.design"), t("form.designHint"), 3)}
        {area("techNotes", t("form.techNotes"), t("form.techNotesHint"), 3)}
        {area("testingNotes", t("form.qaNotes"), t("form.qaNotesHint"), 3)}
      </div>
      {area("deployNotes", t("form.deployNotes"), t("form.deployNotesHint"), 3)}
      <div className="grid gap-3 sm:grid-cols-2">
        {area("depends", t("form.epicDepends"), t("form.dependsHint"), 2)}
        {area("docs", t("form.docs"), t("form.perLine"), 2)}
      </div>
      <div>
        <label className="label">{t("status")}</label>
        <select className="input max-w-xs" value={v.status} onChange={(e) => set({ status: e.target.value })}>
          {Object.entries(EPIC_STATUSES).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="rounded-lg bg-bad-50 px-3 py-2 text-sm text-bad">{t.has(`form.errors.${error}`) ? t(`form.errors.${error}` as "form.errors.invalid") : error}</p>}

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary btn-sm" disabled={pending} onClick={save}>
          {t("save")}
        </button>
        {canDelete && (
          <button
            className="btn-danger btn-sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (!confirm(t("form.deleteConfirm"))) return;
                const r = await ccDeleteEpicAction(v.key);
                if (!r.ok) return setError(r.error);
                router.push("/admin/control/epics");
                router.refresh();
              })
            }
          >
            {t("form.delete")}
          </button>
        )}
      </div>
      <p className="text-xs text-muted">{t("form.sourceNote")}</p>
    </div>
  );
}
