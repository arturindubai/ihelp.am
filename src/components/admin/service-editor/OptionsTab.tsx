"use client";
import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { GripVertical, Plus } from "lucide-react";
import { cn, amd, durationLabel } from "@/lib/format";
import { tr } from "@/i18n/locales";
import { ICON_NAMES, Icon } from "@/components/Icon";
import { I18nInput, NumInput, Toggle } from "@/components/admin/fields";
import type { ServicePayload } from "@/server/actions/admin/catalog";

type G = ServicePayload["groups"][number];
type O = G["options"][number];

function reorder<T>(arr: T[], from: number, to: number): T[] {
  const a = [...arr];
  const [item] = a.splice(from, 1);
  a.splice(to, 0, item);
  return a;
}

export function OptionsTab({
  s,
  up,
  setGroup,
  setOpt,
}: {
  s: ServicePayload;
  up: (patch: Partial<ServicePayload>) => void;
  setGroup: (gi: number, patch: Partial<G>) => void;
  setOpt: (gi: number, oi: number, patch: Partial<O>) => void;
}) {
  const t = useTranslations("admin");
  const locale = useLocale();

  // Drag-and-drop для групп: dragstart разрешается только если нажат grip
  const groupGrip = useRef(false);
  const groupFrom = useRef<number | null>(null);
  const [groupOver, setGroupOver] = useState<number | null>(null);

  // Drag-and-drop для опций (только внутри одной группы)
  const optGrip = useRef(false);
  const optFrom = useRef<{ gi: number; oi: number } | null>(null);
  const [optOver, setOptOver] = useState<{ gi: number; oi: number } | null>(null);

  return (
    <div className="space-y-4">
      {s.groups.length === 0 && (
        <p className="text-sm text-muted">{t("services.noGroups")}</p>
      )}

      {s.groups.map((g, gi) => {
        const gDragging = groupFrom.current === gi;
        const gOver = groupOver === gi && groupFrom.current !== null && groupFrom.current !== gi;

        return (
          <div
            key={g.id || `new-${gi}`}
            draggable
            onDragStart={(e) => {
              if (!groupGrip.current) { e.preventDefault(); return; }
              e.dataTransfer.effectAllowed = "move";
              e.stopPropagation();
              groupFrom.current = gi;
            }}
            onDragOver={(e) => {
              if (groupFrom.current === null) return;
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
              if (groupOver !== gi) setGroupOver(gi);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const from = groupFrom.current;
              if (from !== null && from !== gi) {
                up({ groups: reorder(s.groups, from, gi) });
              }
              groupFrom.current = null;
              groupGrip.current = false;
              setGroupOver(null);
            }}
            onDragEnd={() => {
              groupGrip.current = false;
              groupFrom.current = null;
              setGroupOver(null);
            }}
            className={cn(
              "rounded-xl border",
              gDragging && "opacity-50 ring-2 ring-brand",
              gOver ? "border-2 border-dashed border-brand" : "border-line",
            )}
          >
            <details open={!g.id}>
              <summary className="flex cursor-pointer list-none items-center gap-2 p-3">
                <span
                  className="shrink-0 cursor-grab text-muted"
                  onPointerDown={(e) => { e.stopPropagation(); groupGrip.current = true; }}
                  onPointerUp={() => { groupGrip.current = false; }}
                >
                  <GripVertical size={16} />
                </span>
                <span className={cn("min-w-0 flex-1 truncate font-medium", !g.active && "text-muted line-through")}>
                  {tr(g.title, locale) || t("services.group")}
                </span>
                <span className="shrink-0 text-xs text-muted">{g.options.length}</span>
                <span onClick={(e) => e.preventDefault()}>
                  <button
                    type="button"
                    className="btn-ghost btn-sm px-2 text-bad"
                    onClick={() => confirm(t("common.deleteConfirm")) && up({ groups: s.groups.filter((_, i) => i !== gi) })}
                  >
                    <span aria-hidden>×</span>
                  </button>
                </span>
              </summary>

              <div className="border-t border-line p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <I18nInput label={t("services.groupTitle")} required value={g.title} onChange={(v) => setGroup(gi, { title: v })} />
                  <I18nInput label={t("services.hint")} value={g.hint} onChange={(v) => setGroup(gi, { hint: v })} />
                  <I18nInput label={t("services.infoTitle")} value={g.infoTitle} onChange={(v) => setGroup(gi, { infoTitle: v })} />
                  <I18nInput label={t("services.infoBody")} multiline value={g.infoBody} onChange={(v) => setGroup(gi, { infoBody: v })} />
                  <div>
                    <label className="label">{t("services.groupType")}</label>
                    <select className="input" value={g.type} onChange={(e) => setGroup(gi, { type: e.target.value as "SINGLE" })}>
                      <option value="SINGLE">{t("services.single")}</option>
                      <option value="MULTI">{t("services.multi")}</option>
                    </select>
                  </div>
                  <div className="space-y-1 pt-1">
                    <Toggle label={t("services.requiredGroup")} checked={g.required} onChange={(v) => setGroup(gi, { required: v })} />
                    <Toggle label={t("services.durationGroup")} checked={g.isDuration} onChange={(v) => setGroup(gi, { isDuration: v })} />
                    <Toggle label={t("common.active")} checked={g.active} onChange={(v) => setGroup(gi, { active: v })} />
                  </div>
                </div>

                {g.options.length === 0 && (
                  <p className="mt-3 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn">{t("services.noVariants")}</p>
                )}

                <div className="mt-4 space-y-2">
                  {g.options.map((o, oi) => {
                    const oFrom = optFrom.current;
                    const oDragging = oFrom?.gi === gi && oFrom?.oi === oi;
                    const oOver = optOver?.gi === gi && optOver?.oi === oi && oFrom?.gi === gi && oFrom?.oi !== oi;

                    return (
                      <div
                        key={o.id || `n${oi}`}
                        draggable
                        onDragStart={(e) => {
                          if (!optGrip.current) { e.preventDefault(); return; }
                          e.dataTransfer.effectAllowed = "move";
                          e.stopPropagation();
                          optFrom.current = { gi, oi };
                        }}
                        onDragOver={(e) => {
                          const from = optFrom.current;
                          if (!from || from.gi !== gi) return;
                          e.preventDefault();
                          e.stopPropagation();
                          if (!optOver || optOver.gi !== gi || optOver.oi !== oi) {
                            setOptOver({ gi, oi });
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const from = optFrom.current;
                          if (from && from.gi === gi && from.oi !== oi) {
                            setGroup(gi, { options: reorder(g.options, from.oi, oi) });
                          }
                          optFrom.current = null;
                          optGrip.current = false;
                          setOptOver(null);
                        }}
                        onDragEnd={() => {
                          optGrip.current = false;
                          optFrom.current = null;
                          setOptOver(null);
                        }}
                        className={cn(
                          "rounded-xl border",
                          oDragging && "opacity-50 ring-2 ring-brand",
                          oOver ? "border-2 border-dashed border-brand" : "border-line",
                        )}
                      >
                        <details open={!o.id}>
                          <summary className="flex cursor-pointer list-none items-center gap-2 p-3">
                            <span
                              className="shrink-0 cursor-grab text-muted"
                              onPointerDown={(e) => { e.stopPropagation(); optGrip.current = true; }}
                              onPointerUp={() => { optGrip.current = false; }}
                            >
                              <GripVertical size={16} />
                            </span>
                            <span className={cn("min-w-0 flex-1 truncate font-medium", !o.active && "text-muted line-through")}>
                              {tr(o.title, locale) || t("services.option")}
                            </span>
                            <span className="shrink-0 text-sm">
                              {amd(o.price)} · {durationLabel(o.durationMin, locale)}
                            </span>
                            {o.isDefault && <span className="chip">★</span>}
                            <span onClick={(e) => e.preventDefault()}>
                              <button
                                type="button"
                                className="btn-ghost btn-sm px-2 text-bad"
                                onClick={() => setGroup(gi, { options: g.options.filter((_, i) => i !== oi) })}
                              >
                                <span aria-hidden>×</span>
                              </button>
                            </span>
                          </summary>

                          <div className="grid gap-3 border-t border-line p-3 md:grid-cols-2">
                            <I18nInput label={t("common.title")} required value={o.title} onChange={(v) => setOpt(gi, oi, { title: v })} />
                            <I18nInput label={t("common.subtitle")} value={o.subtitle} onChange={(v) => setOpt(gi, oi, { subtitle: v })} />
                            <NumInput label={t("services.optPrice")} value={o.price} onChange={(v) => setOpt(gi, oi, { price: v ?? 0 })} />
                            <NumInput label={t("services.optDuration")} value={o.durationMin} step={15} onChange={(v) => setOpt(gi, oi, { durationMin: v ?? 0 })} />
                            <I18nInput label={t("common.badge")} value={o.badge} onChange={(v) => setOpt(gi, oi, { badge: v })} />
                            <div className="space-y-1">
                              <Toggle label={t("services.discountable")} checked={o.discountable} onChange={(v) => setOpt(gi, oi, { discountable: v })} />
                              <Toggle
                                label={t("services.isDefault")}
                                checked={o.isDefault}
                                onChange={(v) =>
                                  setGroup(gi, {
                                    options: g.options.map((x, i) => ({
                                      ...x,
                                      isDefault: i === oi ? v : g.type === "SINGLE" && v ? false : x.isDefault,
                                    })),
                                  })
                                }
                              />
                              <Toggle label={t("common.active")} checked={o.active} onChange={(v) => setOpt(gi, oi, { active: v })} />
                            </div>
                            {g.isDuration && (
                              <div className="md:col-span-2">
                                <label className="label">{t("services.schedule")}</label>
                                <div className="space-y-2">
                                  {o.schedule.map((row, ri) => (
                                    <div key={ri} className="flex items-end gap-2">
                                      <select
                                        className="input w-24 shrink-0"
                                        value={row.icon}
                                        onChange={(e) =>
                                          setOpt(gi, oi, { schedule: o.schedule.map((x, i) => (i === ri ? { ...x, icon: e.target.value } : x)) })
                                        }
                                      >
                                        {ICON_NAMES.map((n) => <option key={n}>{n}</option>)}
                                      </select>
                                      <span className="mb-3 shrink-0"><Icon name={row.icon} size={18} /></span>
                                      <div className="min-w-0 flex-1">
                                        <I18nInput
                                          value={row.title}
                                          onChange={(v) =>
                                            setOpt(gi, oi, { schedule: o.schedule.map((x, i) => (i === ri ? { ...x, title: v } : x)) })
                                          }
                                        />
                                      </div>
                                      <input
                                        className="input w-20 shrink-0"
                                        type="number"
                                        value={row.minutes}
                                        onChange={(e) =>
                                          setOpt(gi, oi, { schedule: o.schedule.map((x, i) => (i === ri ? { ...x, minutes: Number(e.target.value) || 0 } : x)) })
                                        }
                                      />
                                      <button
                                        type="button"
                                        className="btn-ghost btn-sm px-2 text-bad"
                                        onClick={() => setOpt(gi, oi, { schedule: o.schedule.filter((_, i) => i !== ri) })}
                                      >
                                        <span aria-hidden>×</span>
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    className="btn-ghost btn-sm"
                                    onClick={() => setOpt(gi, oi, { schedule: [...o.schedule, { icon: "check", title: {}, minutes: 10 }] })}
                                  >
                                    <Plus size={14} /> {t("services.addScheduleRow")}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </details>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    onClick={() =>
                      setGroup(gi, {
                        options: [
                          ...g.options,
                          { title: {}, subtitle: null, badge: null, price: 0, durationMin: g.isDuration ? 60 : 0, discountable: g.isDuration, isDefault: false, active: true, schedule: [] },
                        ],
                      })
                    }
                  >
                    <Plus size={14} /> {t("services.addOption")}
                  </button>
                </div>
              </div>
            </details>
          </div>
        );
      })}

      <button
        type="button"
        className="btn-dark"
        onClick={() =>
          up({
            groups: [
              ...s.groups,
              { title: {}, hint: null, infoTitle: null, infoBody: null, type: "SINGLE", required: true, isDuration: false, active: true, options: [] },
            ],
          })
        }
      >
        <Plus size={18} /> {t("services.addGroup")}
      </button>
    </div>
  );
}
