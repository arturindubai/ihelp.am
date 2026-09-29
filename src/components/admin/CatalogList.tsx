"use client";
import { useState, useTransition, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { GripVertical, Pencil, Plus, Copy, ExternalLink, Trash2, ChevronDown, ChevronRight, Search, Archive, ArchiveRestore } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  archiveCategoryAction,
  createServiceAction,
  deleteCategoryAction,
  deleteServiceAction,
  duplicateServiceAction,
  reorderCategoriesAction,
  reorderServicesAction,
  saveCategoryAction,
  toggleServiceAction,
  toggleServiceComingSoonAction,
} from "@/server/actions/admin/catalog";
import { cn } from "@/lib/format";
import { Sheet } from "@/components/ui/Sheet";
import { I18nInput, ImageInput, NumInput, TextInput, Toggle, type I18n } from "./fields";
import { Img } from "@/components/Img";
import type { AdminCatalogCategory, AdminCatalogService } from "@/server/services/adminCatalog";

type Filter = "all" | "active" | "hidden" | "soon";

function SmallToggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition",
        checked ? "bg-ok" : "bg-line",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className={cn("absolute top-0.5 size-4 rounded-full bg-inverse shadow transition", checked ? "left-[17px]" : "left-0.5")} />
    </button>
  );
}

function StatusBadge({ active, comingSoon, archived }: { active: boolean; comingSoon: boolean; archived: boolean }) {
  const t = useTranslations("admin.services");
  if (archived) return <span className="chip bg-surface text-muted">{t("archived")}</span>;
  if (comingSoon) return <span className="chip bg-badge text-on-badge">{t("comingSoonLabel")}</span>;
  if (!active) return <span className="chip bg-bad-50 text-bad">{t("filterHidden")}</span>;
  return null;
}

type EditCat = { id?: string; slug: string; title: I18n; description: I18n | null; image: string | null; sort: number; active: boolean; comingSoon: boolean; archived: boolean };

export function CatalogList({ categories: initial, pageTitle }: { categories: AdminCatalogCategory[]; pageTitle: string }) {
  const t = useTranslations("admin.services");
  const tc = useTranslations("admin.common");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [categories, setCategories] = useState<AdminCatalogCategory[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [mobileCatOpen, setMobileCatOpen] = useState(false);

  const [editCat, setEditCat] = useState<EditCat | null>(null);
  const [editCatErr, setEditCatErr] = useState<string>();

  const dragCatRef = useRef<number | null>(null);
  const dragSvcRef = useRef<number | null>(null);
  const [dragCatOver, setDragCatOver] = useState<number | null>(null);
  const [dragSvcOver, setDragSvcOver] = useState<number | null>(null);

  const selectedCategory = categories.find((c) => c.id === selectedId) ?? categories[0] ?? null;

  const q = search.toLowerCase();
  const filteredCats = categories.filter((c) => {
    if (q && !c.title[locale]?.toLowerCase().includes(q) && !c.slug.includes(q)) {
      const hasMatch = c.services.some((s) => s.title.toLowerCase().includes(q) || s.slug.includes(q));
      if (!hasMatch) return false;
    }
    if (filter === "active") return c.active && !c.comingSoon && !c.archived;
    if (filter === "hidden") return !c.active && !c.archived;
    if (filter === "soon") return c.comingSoon && !c.archived;
    return true;
  });

  const filteredServices = (selectedCategory?.services ?? []).filter((s) => {
    if (q && !s.title.toLowerCase().includes(q) && !s.slug.includes(q)) return false;
    if (filter === "active") return s.active && !s.comingSoon;
    if (filter === "hidden") return !s.active;
    if (filter === "soon") return s.comingSoon;
    return true;
  });

  const reorderCats = (from: number, to: number) => {
    const next = [...categories];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setCategories(next);
    start(async () => { await reorderCategoriesAction(next.map((c) => c.id)); });
  };

  const reorderSvcs = (from: number, to: number) => {
    if (!selectedCategory) return;
    const svcs = [...selectedCategory.services];
    const [item] = svcs.splice(from, 1);
    svcs.splice(to, 0, item);
    setCategories(categories.map((c) => c.id === selectedCategory.id ? { ...c, services: svcs } : c));
    start(async () => { await reorderServicesAction(svcs.map((s) => s.id)); });
  };

  const toggleActive = (svcId: string, val: boolean) => {
    setCategories(categories.map((c) => ({ ...c, services: c.services.map((s) => s.id === svcId ? { ...s, active: val } : s) })));
    start(async () => { await toggleServiceAction(svcId, val); });
  };

  const toggleSoon = (svcId: string, val: boolean) => {
    setCategories(categories.map((c) => ({ ...c, services: c.services.map((s) => s.id === svcId ? { ...s, comingSoon: val } : s) })));
    start(async () => { await toggleServiceComingSoonAction(svcId, val); });
  };

  const archiveCat = (catId: string, archived: boolean) => {
    setCategories(categories.map((c) => c.id === catId ? { ...c, archived } : c));
    start(async () => { await archiveCategoryAction(catId, archived); });
  };

  const saveCat = () => start(async () => {
    if (!editCat) return;
    const r = await saveCategoryAction(editCat);
    if (!r.ok) return setEditCatErr(r.error === "slug" ? tc("slugHint") : `${tc("error")}: ${r.error}`);
    setEditCat(null); router.refresh();
  });

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: t("filterAll") },
    { key: "active", label: t("filterActive") },
    { key: "hidden", label: t("filterHidden") },
    { key: "soon", label: t("filterSoon") },
  ];

  const CatPanel = (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="text-sm font-semibold">{t("categories")}</span>
        <button
          className="btn-ghost btn-sm gap-1 text-xs"
          onClick={() => { setEditCatErr(undefined); setEditCat({ slug: "", title: {}, description: null, image: null, sort: categories.length, active: true, comingSoon: false, archived: false }); }}
        >
          <Plus size={14} /> {t("newCategory")}
        </button>
      </div>
      <ul className="overflow-y-auto">
        {filteredCats.map((cat, i) => (
          <li
            key={cat.id}
            draggable
            onDragStart={() => { dragCatRef.current = i; }}
            onDragOver={(e) => { e.preventDefault(); setDragCatOver(i); }}
            onDragLeave={() => setDragCatOver(null)}
            onDrop={() => { if (dragCatRef.current !== null && dragCatRef.current !== i) reorderCats(dragCatRef.current, i); dragCatRef.current = null; setDragCatOver(null); }}
            onDragEnd={() => { dragCatRef.current = null; setDragCatOver(null); }}
            onClick={() => { setSelectedId(cat.id); setMobileCatOpen(false); }}
            className={cn(
              "flex cursor-pointer items-center gap-2 border-b border-line px-3 py-2 transition",
              selectedId === cat.id ? "border-l-2 border-l-brand bg-brand-50" : "hover:bg-surface",
              dragCatOver === i && "bg-brand-50 outline outline-1 outline-brand",
              cat.archived && "opacity-60",
            )}
          >
            <span className="shrink-0 cursor-grab text-muted active:cursor-grabbing" onClick={(e) => e.stopPropagation()}>
              <GripVertical size={16} />
            </span>
            <Img src={cat.image || "/img/cat-cleaning.svg"} width={36} className="size-9 shrink-0 rounded-xl border border-line bg-surface object-cover" />
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="truncate text-sm font-medium">{cat.title[locale] ?? cat.title.ru ?? cat.slug}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted">
                <span>{cat.services.length} {t("services").toLowerCase()}</span>
                <span>·</span>
                <span className="font-mono">{cat.slug}</span>
              </div>
            </div>
            <div className="shrink-0">
              <StatusBadge active={cat.active} comingSoon={cat.comingSoon} archived={cat.archived} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );

  const warningBanner = selectedCategory && (
    selectedCategory.archived
      ? <div className="flex items-center gap-2 rounded-lg border border-warn bg-warn-50 px-3 py-2 text-sm text-warn">{t("categoryArchivedBanner")}</div>
      : !selectedCategory.active && selectedCategory.services.length > 0
        ? <div className="flex items-center gap-2 rounded-lg border border-warn bg-warn-50 px-3 py-2 text-sm text-warn">{t("categoryHiddenBanner", { n: selectedCategory.services.length })}</div>
        : null
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Шапка страницы */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 text-2xl font-bold tracking-tight">{pageTitle}</h1>
        <div className="flex gap-2">
          <button
            className="btn-outline btn-sm"
            onClick={() => { setEditCatErr(undefined); setEditCat({ slug: "", title: {}, description: null, image: null, sort: categories.length, active: true, comingSoon: false, archived: false }); }}
          >
            <Plus size={16} /> {t("newCategory")}
          </button>
          <button
            className="btn-primary btn-sm"
            disabled={pending || !selectedCategory}
            onClick={() => selectedCategory && start(async () => { const r = await createServiceAction(selectedCategory.id); router.push(`/admin/services/${r.id}`); })}
          >
            <Plus size={16} /> {t("newService")}
          </button>
        </div>
      </div>

      {/* Строка поиска и фильтры */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-9"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex overflow-x-auto rounded-lg border border-line bg-paper p-0.5 text-sm">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn("shrink-0 rounded-md px-3 py-1 transition", filter === key ? "bg-brand text-on-action" : "text-muted hover:bg-surface")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Двухколоночный layout (desktop) / аккордеон + список (mobile) */}
      <div className="flex flex-col gap-4 md:flex-row">
        {/* Левая панель — категории (только desktop) */}
        <div className="hidden w-[300px] shrink-0 md:block">
          <div className="card overflow-hidden">
            {CatPanel}
          </div>
        </div>

        {/* Мобильный аккордеон категорий (только mobile) */}
        <div className="md:hidden">
          <button
            className="card flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
            onClick={() => setMobileCatOpen((v) => !v)}
          >
            <span className="flex items-center gap-2">
              {selectedCategory && <Img src={selectedCategory.image || "/img/cat-cleaning.svg"} width={28} className="size-7 rounded-lg object-cover" />}
              {selectedCategory?.title[locale] ?? selectedCategory?.title.ru ?? t("categories")}
            </span>
            {mobileCatOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          {mobileCatOpen && (
            <div className="card mt-2 max-h-[200px] overflow-y-auto">
              {CatPanel}
            </div>
          )}
        </div>

        {/* Правая панель — услуги */}
        <div className="min-w-0 flex-1">
          {selectedCategory ? (
            <div className="card overflow-hidden">
              {/* Шапка правой панели */}
              <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                <div className="min-w-0 flex-1">
                  <span className="truncate font-semibold">{selectedCategory.title[locale] ?? selectedCategory.title.ru}</span>
                  <span className="ml-2 text-sm text-muted">{selectedCategory.services.length} {t("services").toLowerCase()}</span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="btn-ghost btn-sm"
                    title={selectedCategory.archived ? t("restoreCategory") : t("archiveCategory")}
                    disabled={pending}
                    onClick={() => archiveCat(selectedCategory.id, !selectedCategory.archived)}
                  >
                    {selectedCategory.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                  </button>
                  <button
                    className="btn-ghost btn-sm"
                    title={tc("edit")}
                    onClick={() => { setEditCatErr(undefined); setEditCat({ id: selectedCategory.id, slug: selectedCategory.slug, title: selectedCategory.title, description: selectedCategory.description, image: selectedCategory.image, sort: selectedCategory.sort, active: selectedCategory.active, comingSoon: selectedCategory.comingSoon, archived: selectedCategory.archived }); }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="btn-primary btn-sm"
                    disabled={pending}
                    onClick={() => start(async () => { const r = await createServiceAction(selectedCategory.id); router.push(`/admin/services/${r.id}`); })}
                  >
                    <Plus size={16} /> <span className="hidden sm:inline">{t("newService")}</span>
                  </button>
                </div>
              </div>

              {/* Предупреждение о скрытой/заархивированной категории */}
              {warningBanner && <div className="px-4 pt-3">{warningBanner}</div>}

              {/* Список услуг */}
              <ul className="divide-y divide-line">
                {filteredServices.map((svc, i) => (
                  <ServiceRow
                    key={svc.id}
                    svc={svc}
                    locale={locale}
                    index={i}
                    pending={pending}
                    dragOver={dragSvcOver === i}
                    onDragStart={() => { dragSvcRef.current = i; }}
                    onDragOver={(e) => { e.preventDefault(); setDragSvcOver(i); }}
                    onDragLeave={() => setDragSvcOver(null)}
                    onDrop={() => { if (dragSvcRef.current !== null && dragSvcRef.current !== i) reorderSvcs(dragSvcRef.current, i); dragSvcRef.current = null; setDragSvcOver(null); }}
                    onDragEnd={() => { dragSvcRef.current = null; setDragSvcOver(null); }}
                    onToggleActive={(v) => toggleActive(svc.id, v)}
                    onToggleSoon={(v) => toggleSoon(svc.id, v)}
                    onDuplicate={() => start(async () => { const r = await duplicateServiceAction(svc.id); router.push(`/admin/services/${r.id}`); })}
                    onDelete={() => { if (confirm(tc("deleteConfirm"))) start(async () => { await deleteServiceAction(svc.id); router.refresh(); }); }}
                  />
                ))}
              </ul>

              {/* Кнопка добавления услуги пунктирной рамкой */}
              <div className="p-3">
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-3 text-sm text-muted hover:border-brand hover:text-brand"
                  disabled={pending}
                  onClick={() => start(async () => { const r = await createServiceAction(selectedCategory.id); router.push(`/admin/services/${r.id}`); })}
                >
                  <Plus size={16} /> {t("addFirstService")}
                </button>
              </div>
            </div>
          ) : (
            <div className="card flex items-center justify-center p-12 text-muted">
              {t("noServicesInCategory")}
            </div>
          )}
        </div>
      </div>

      {/* Редактор категории */}
      <Sheet
        open={!!editCat}
        onClose={() => setEditCat(null)}
        title={editCat?.id ? tc("edit") : t("newCategory").replace("+ ", "")}
        footer={
          <div className="flex gap-2">
            {editCat?.id && (
              <button
                className="btn-outline btn-sm"
                disabled={pending}
                onClick={() => { if (editCat.id) archiveCat(editCat.id, !editCat.archived); setEditCat(null); }}
              >
                {editCat.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                {editCat.archived ? t("restoreCategory") : t("archiveCategory")}
              </button>
            )}
            <button className="btn-primary flex-1" disabled={pending} onClick={saveCat}>{tc("save")}</button>
          </div>
        }
      >
        {editCat && (
          <div className="space-y-3">
            <I18nInput label={tc("title")} required value={editCat.title} onChange={(v) => setEditCat({ ...editCat, title: v })} />
            <TextInput label={tc("slug")} hint={tc("slugHint")} value={editCat.slug} onChange={(v) => setEditCat({ ...editCat, slug: v })} />
            <I18nInput label={tc("description")} multiline value={editCat.description} onChange={(v) => setEditCat({ ...editCat, description: v })} />
            <ImageInput label={tc("image")} value={editCat.image} onChange={(v) => setEditCat({ ...editCat, image: v })} />
            <NumInput label={tc("sort")} value={editCat.sort} onChange={(v) => setEditCat({ ...editCat, sort: v ?? 0 })} />
            <Toggle label={tc("active")} checked={editCat.active} onChange={(v) => setEditCat({ ...editCat, active: v })} />
            <Toggle label={t("comingSoon")} checked={editCat.comingSoon} onChange={(v) => setEditCat({ ...editCat, comingSoon: v })} />
            {editCatErr && <p className="text-sm text-bad">{editCatErr}</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function ServiceRow({
  svc, locale, index, pending, dragOver,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
  onToggleActive, onToggleSoon, onDuplicate, onDelete,
}: {
  svc: AdminCatalogService;
  locale: string;
  index: number;
  pending: boolean;
  dragOver: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onToggleActive: (v: boolean) => void;
  onToggleSoon: (v: boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("admin.services");
  const tc = useTranslations("admin.common");

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        "flex flex-col gap-1 px-3 py-2.5 transition sm:flex-row sm:items-center sm:gap-2",
        !svc.active && "opacity-75",
        dragOver && "bg-brand-50 outline outline-1 outline-brand",
      )}
    >
      {/* Основная строка */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 cursor-grab text-muted active:cursor-grabbing">
          <GripVertical size={16} />
        </span>
        <Img src={svc.image || "/img/svc-regular.svg"} width={52} className="size-13 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{svc.title}</div>
          <div className="hidden flex-wrap items-center gap-1.5 text-xs text-muted sm:flex">
            <span className="font-mono">/{svc.slug}</span>
            {svc.orders > 0 && <><span>·</span><span>{svc.orders} {t("bookings")}</span></>}
            {svc.reviews > 0 && <><span>·</span><span>★ {svc.rating.toFixed(1)}</span></>}
            {svc.orders === 0 && !svc.active && <><span>·</span><span className="text-bad">{t("draft")}</span></>}
            {svc.minPrice !== null && <><span>·</span><span>{t("minPrice", { price: svc.minPrice })}</span></>}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted sm:hidden">
            <span className="font-mono">/{svc.slug}</span>
            {svc.minPrice !== null && <><span>·</span><span>{t("minPrice", { price: svc.minPrice })}</span></>}
          </div>
        </div>
      </div>
      {/* Переключатели и кнопки */}
      <div className="flex items-center gap-2 sm:shrink-0">
        <SmallToggle checked={svc.active} onChange={onToggleActive} disabled={pending} label={tc("active")} />
        <SmallToggle checked={svc.comingSoon} onChange={onToggleSoon} disabled={pending} label={t("comingSoon")} />
        <div className="flex items-center">
          <Link className="btn-ghost btn-sm px-1.5" href={`/admin/services/${svc.id}`} title={tc("edit")}><Pencil size={15} /></Link>
          <button className="btn-ghost btn-sm px-1.5" title={tc("copy")} disabled={pending} onClick={onDuplicate}><Copy size={15} /></button>
          <a className="btn-ghost btn-sm px-1.5" href={`/${locale}/s/${svc.slug}`} target="_blank" title={t("openOnSite")}><ExternalLink size={15} /></a>
          <button className="btn-ghost btn-sm px-1.5 text-bad" title={tc("delete")} disabled={pending} onClick={onDelete}><Trash2 size={15} /></button>
        </div>
      </div>
    </li>
  );
}
