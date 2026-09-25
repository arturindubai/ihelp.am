"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ccDeleteTaskAction, ccSaveTaskAction } from "@/server/actions/admin/cc";
import { AREAS, LAYERS, OWNERS, PRIORITIES, STAGES } from "@/lib/backlog-labels";
import { TextInput } from "@/components/admin/fields";

export interface TaskFormValue {
  key: string;
  title: string;
  summary: string;
  details: string;
  requirements: string;
  design: string;
  qaNotes: string;
  deployNotes: string;
  needs: string;
  depends: string;
  docs: string;
  epicKey: string;
  area: string;
  layer: string;
  priority: string;
  stage: string;
  owner: string;
  estimate: string;
  scope: string;
}

export const EMPTY_TASK: TaskFormValue = {
  key: "",
  title: "",
  summary: "",
  details: "",
  requirements: "",
  design: "",
  qaNotes: "",
  deployNotes: "",
  needs: "",
  depends: "",
  docs: "",
  epicKey: "",
  area: "product",
  layer: "fullstack",
  priority: "p1",
  stage: "public",
  owner: "tech",
  estimate: "",
  scope: "",
};

const toLines = (v: string) => v.split("\n").map((l) => l.trim()).filter(Boolean);

/** Форма задачи: создание новой и правка существующей. Правка переводит задачу на ручное ведение */
export function TaskEditorForm({ initial, isNew, canDelete, epics }: { initial: TaskFormValue; isNew: boolean; canDelete?: boolean; epics: { key: string; title: string }[] }) {
  const t = useTranslations("admin.cc");
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (patch: Partial<TaskFormValue>) => setV((x) => ({ ...x, ...patch }));

  const select = (field: keyof TaskFormValue, options: Record<string, string> | readonly string[], label: string) => (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={v[field]} onChange={(e) => set({ [field]: e.target.value })}>
        {Array.isArray(options)
          ? options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))
          : Object.entries(options as Record<string, string>).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
      </select>
    </div>
  );

  const epicSelect = (
    <div>
      <label className="label">{t("epic")}</label>
      <select className="input" value={v.epicKey} onChange={(e) => set({ epicKey: e.target.value })}>
        <option value="">{t("form.noEpic")}</option>
        {epics.map((e) => (
          <option key={e.key} value={e.key}>
            {e.title}
          </option>
        ))}
      </select>
    </div>
  );

  const area = (field: keyof TaskFormValue, label: string, hint?: string, rows = 4) => (
    <div>
      <label className="label">{label}</label>
      <textarea className="input py-2" style={{ minHeight: rows * 28 }} value={v[field]} onChange={(e) => set({ [field]: e.target.value })} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );

  const save = () =>
    start(async () => {
      setError(null);
      const r = await ccSaveTaskAction(
        {
          key: v.key,
          title: v.title,
          summary: v.summary,
          details: v.details || null,
          requirements: toLines(v.requirements),
          design: v.design || null,
          qaNotes: v.qaNotes || null,
          deployNotes: v.deployNotes || null,
          needs: toLines(v.needs),
          depends: toLines(v.depends.replace(/,/g, "\n")),
          docs: toLines(v.docs),
          epicKey: v.epicKey || null,
          area: v.area,
          layer: v.layer,
          priority: v.priority,
          stage: v.stage,
          owner: v.owner,
          estimate: v.estimate || null,
          scope: toLines(v.scope),
        },
        isNew,
      );
      if (!r.ok) return setError(r.error);
      router.push(`/admin/control/${r.key}`);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label={t("form.key")} value={v.key} onChange={(x) => set({ key: x.toUpperCase() })} hint={isNew ? t("form.keyHint") : undefined} {...(isNew ? {} : { disabled: true })} />
        <TextInput label={t("form.title")} value={v.title} onChange={(x) => set({ title: x })} />
      </div>
      {area("summary", t("form.summary"), t("form.summaryHint"), 3)}
      {area("details", t("form.details"), undefined, 4)}
      {area("requirements", t("form.requirements"), t("form.perLine"), 4)}
      <div className="grid gap-3 sm:grid-cols-3">
        {area("design", t("form.design"), t("form.designHint"), 3)}
        {area("qaNotes", t("form.qaNotes"), t("form.qaNotesHint"), 3)}
        {area("deployNotes", t("form.deployNotes"), t("form.deployNotesHint"), 3)}
      </div>
      {area("needs", t("form.needs"), t("form.perLine"), 3)}
      <div className="grid gap-3 sm:grid-cols-3">
        {area("depends", t("form.depends"), t("form.dependsHint"), 2)}
        {area("docs", t("form.docs"), t("form.perLine"), 2)}
        {area("scope", t("form.scope"), t("form.scopeHint"), 2)}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {epicSelect}
        {select("area", AREAS, t("area"))}
        {select("layer", LAYERS, t("layer"))}
        {select("priority", PRIORITIES, t("priority"))}
        {select("stage", STAGES, t("stage"))}
        {select("owner", OWNERS, t("owner"))}
      </div>
      <TextInput label={t("form.estimate")} value={v.estimate} onChange={(x) => set({ estimate: x.toUpperCase() })} hint={t("form.estimateHint")} />

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
                const r = await ccDeleteTaskAction(v.key);
                if (!r.ok) return setError(r.error);
                router.push("/admin/control");
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
