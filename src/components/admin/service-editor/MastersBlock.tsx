"use client";
import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { GripVertical, Search } from "lucide-react";
import { cn } from "@/lib/format";
import { Img } from "@/components/Img";
import { Card } from "@/components/admin/fields";
import type { ServicePayload } from "@/server/actions/admin/catalog";

export type MasterInfo = {
  id: string;
  name: string;
  photo: string | null;
  active: boolean;
  visitsNextWeek: number;
};

export function MastersBlock({
  s,
  up,
  masters,
}: {
  s: ServicePayload;
  up: (patch: Partial<ServicePayload>) => void;
  masters: MasterInfo[];
}) {
  const t = useTranslations("admin.services");
  const [search, setSearch] = useState("");
  const dragIdx = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const q = search.toLowerCase();
  const filtered = masters.filter((m) => !q || m.name.toLowerCase().includes(q));

  const toggle = (id: string, checked: boolean) => {
    up({ masterIds: checked ? [...s.masterIds, id] : s.masterIds.filter((x) => x !== id) });
  };

  // Перетаскивание только среди выбранных мастеров меняет порядок в masterIds
  const selectedMasters = s.masterIds.map((id) => masters.find((m) => m.id === id)).filter(Boolean) as MasterInfo[];

  const reorderSelected = (from: number, to: number) => {
    const next = [...s.masterIds];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    up({ masterIds: next });
  };

  const selectedCount = s.masterIds.length;

  return (
    <Card title={`${t("masters")} — ${selectedCount > 0 ? t("mastersSelected", { n: selectedCount }) : "0"}`}>
      <div className="space-y-3">
        {/* Строка поиска */}
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-8 text-sm"
            placeholder={t("masterSearch")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Выбранные мастера — с drag-and-drop */}
        {selectedMasters.length > 0 && (
          <div className="space-y-1">
            {selectedMasters.map((m, i) => (
              <div
                key={m.id}
                draggable
                onDragStart={() => { dragIdx.current = i; }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => {
                  if (dragIdx.current !== null && dragIdx.current !== i) reorderSelected(dragIdx.current, i);
                  dragIdx.current = null;
                  setDragOver(null);
                }}
                onDragEnd={() => { dragIdx.current = null; setDragOver(null); }}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-brand bg-brand-50 px-2 py-1.5 transition",
                  dragOver === i && "opacity-60 outline outline-1 outline-brand",
                )}
              >
                <span className="cursor-grab text-muted active:cursor-grabbing"><GripVertical size={14} /></span>
                {m.photo
                  ? <Img src={m.photo} width={36} className="size-9 shrink-0 rounded-full object-cover" />
                  : <div className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-xs text-muted font-semibold border border-line">{m.name.slice(0, 1)}</div>
                }
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</span>
                {m.visitsNextWeek > 0 && (
                  <span className="shrink-0 text-xs text-muted">{t("visitsNextWeek", { n: m.visitsNextWeek })}</span>
                )}
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-brand"
                  checked
                  onChange={() => toggle(m.id, false)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Все мастера — сетка */}
        <div className="max-h-80 overflow-y-auto">
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
            {filtered.map((m) => {
              const isSelected = s.masterIds.includes(m.id);
              if (isSelected) return null; // уже показан выше
              return (
                <label
                  key={m.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition",
                    isSelected ? "border-brand bg-brand-50" : "border-line bg-paper hover:bg-surface",
                    !m.active && "opacity-50",
                  )}
                >
                  {m.photo
                    ? <Img src={m.photo} width={36} className="size-9 shrink-0 rounded-full object-cover" />
                    : <div className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-xs text-muted font-semibold border border-line">{m.name.slice(0, 1)}</div>
                  }
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.name}</div>
                    {m.visitsNextWeek > 0 && <div className="text-xs text-muted">{t("visitsNextWeek", { n: m.visitsNextWeek })}</div>}
                  </div>
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-brand"
                    checked={false}
                    onChange={() => toggle(m.id, true)}
                  />
                </label>
              );
            })}
          </div>
        </div>

        {masters.length === 0 && (
          <p className="text-sm text-warn">{t("noMasters")}</p>
        )}
      </div>
    </Card>
  );
}
