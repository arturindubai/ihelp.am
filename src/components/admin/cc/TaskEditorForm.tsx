"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ccDeleteTaskAction, ccSaveTaskAction } from "@/server/actions/admin/cc";
import { AREAS, EPICS, LAYERS, OWNERS, PRIORITIES, STAGES } from "@/lib/backlog-labels";
import { TextInput } from "@/components/admin/fields";

export interface TaskFormValue {
  key: string;
  title: string;
  summary: string;
  details: string;
  requirements: string;
  needs: string;
  depends: string;
  docs: string;
  epic: string;
  area: string;
  layer: string;
  priority: string;
  stage: string;
  owner: string;
  estimate: string;
}

export const EMPTY_TASK: TaskFormValue = {
  key: "",
  title: "",
  summary: "",
  details: "",
  requirements: "",
  needs: "",
  depends: "",
  docs: "",
  epic: EPICS[0],
  area: "product",
  layer: "fullstack",
  priority: "p1",
  stage: "public",
  owner: "tech",
  estimate: "",
};

const toLines = (v: string) => v.split("\n").map((l) => l.trim()).filter(Boolean);

/** Форма задачи: создание новой и правка существующей. Правка переводит задачу на ручное ведение */
export function TaskEditorForm({ initial, isNew, canDelete }: { initial: TaskFormValue; isNew: boolean; canDelete?: boolean }) {
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
          needs: toLines(v.needs),
          depends: toLines(v.depends.replace(/,/g, "\n")),
          docs: toLines(v.docs),
          epic: v.epic,
          area: v.area,
          layer: v.layer,
          priority: v.priority,
          stage: v.stage,
          owner: v.owner,
          estimate: v.estimate || null,
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
      {area("needs", t("form.needs"), t("form.perLine"), 3)}
      <div className="grid gap-3 sm:grid-cols-2">
        {area("depends", t("form.depends"), t("form.dependsHint"), 2)}
        {area("docs", t("form.docs"), t("form.perLine"), 2)}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {select("epic", EPICS, t("epic"))}
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
