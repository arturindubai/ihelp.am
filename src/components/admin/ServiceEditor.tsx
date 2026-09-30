"use client";
import { useState, useTransition, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Eye } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { deleteServiceAction, saveServiceAction, saveCategoryAction, type ServicePayload } from "@/server/actions/admin/catalog";
import { type PricingRules } from "@/lib/pricing";
import { cn } from "@/lib/format";
import { tr } from "@/i18n/locales";
import { I18nInput, SaveBar, TextInput, Toggle } from "./fields";
import { Sheet } from "@/components/ui/Sheet";
import { MainTab } from "./service-editor/MainTab";
import { OptionsTab } from "./service-editor/OptionsTab";
import { PlansTab } from "./service-editor/PlansTab";
import { ContentTab } from "./service-editor/ContentTab";
import { StatsBlock, type ServiceStats } from "./service-editor/StatsBlock";
import type { MasterInfo } from "./service-editor/MastersBlock";

type G = ServicePayload["groups"][number];
type O = G["options"][number];
type P = ServicePayload["plans"][number];

type Tab = "main" | "options" | "plans" | "content";

type EditCat = { slug: string; title: import("./fields").I18n; description: import("./fields").I18n | null; image: string | null; sort: number; active: boolean; comingSoon: boolean; archived: boolean };

function tabHasErrors(tab: Tab, s: ServicePayload): boolean {
  switch (tab) {
    case "main":
      return !s.title?.ru?.trim() || !s.slug?.trim();
    case "options":
      return s.groups.some((g) => !g.title?.ru?.trim() || g.options.some((o) => !o.title?.ru?.trim()));
    case "plans":
      return s.plans.some((p) => !p.title?.ru?.trim());
    default:
      return false;
  }
}

export function ServiceEditor({
  id,
  initial,
  categories: initialCategories,
  masters,
  rules,
  stats,
}: {
  id: string;
  initial: ServicePayload;
  categories: { id: string; title: string }[];
  masters: MasterInfo[];
  rules: PricingRules;
  stats: ServiceStats;
}) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const router = useRouter();
  const [s, setS] = useState<ServicePayload>(initial);
  const [tab, setTab] = useState<Tab>("main");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string>();
  const [showPreview, setShowPreview] = useState(false);
  const [categories, setCategories] = useState(initialCategories);

  const [editCat, setEditCat] = useState<EditCat | null>(null);
  const [editCatPending, startCat] = useTransition();
  const [editCatErr, setEditCatErr] = useState<string>();

  const up = useCallback((patch: Partial<ServicePayload>) => {
    setS((x) => ({ ...x, ...patch }));
    setIsDirty(true);
    setSaved(false);
  }, []);

  const setGroup = (gi: number, patch: Partial<G>) =>
    up({ groups: s.groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)) });
  const setOpt = (gi: number, oi: number, patch: Partial<O>) =>
    setGroup(gi, { options: s.groups[gi].options.map((o, i) => (i === oi ? { ...o, ...patch } : o)) });
  const setPlan = (pi: number, patch: Partial<P>) =>
    up({ plans: s.plans.map((p, i) => (i === pi ? { ...p, ...patch } : p)) });
  const setContent = (patch: Partial<ServicePayload["content"]>) =>
    up({ content: { ...s.content, ...patch } });

  const save = () =>
    start(async () => {
      setError(undefined);
      const r = await saveServiceAction(id, s);
      if (!r.ok)
        return setError(
          r.error === "slug"
            ? `${t("common.slug")}: ${t("common.slugHint")}`
            : `${t("common.error")} — ${r.error}`,
        );
      setSaved(true);
      setIsDirty(false);
      router.refresh();
    });

  const discard = useCallback(() => {
    setS(initial);
    setIsDirty(false);
    setSaved(false);
    setError(undefined);
  }, [initial]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const goBack = useCallback(() => {
    if (!isDirty || confirm(t("services.unsavedTitle"))) router.push("/admin/services");
  }, [isDirty, router, t]);

  const TABS: [Tab, string][] = [
    ["main", t("services.tabs.main")],
    ["options", t("services.tabs.options")],
    ["plans", t("services.tabs.plans")],
    ["content", t("services.tabs.content")],
  ];

  const saveCat = () =>
    startCat(async () => {
      if (!editCat) return;
      const r = await saveCategoryAction(editCat);
      if (!r.ok) return setEditCatErr(r.error === "slug" ? t("common.slugHint") : `${t("common.error")}: ${r.error}`);
      const newCat = { id: r.id, title: editCat.title.ru || editCat.slug };
      setCategories((prev) => [...prev, newCat]);
      up({ categoryId: r.id });
      setEditCat(null);
      router.refresh();
    });

  return (
    <div className="max-w-4xl">
      {/* Шапка */}
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <button
          type="button"
          className="btn-ghost btn-sm px-2"
          onClick={goBack}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{tr(s.title, locale) || "—"}</h1>
          <p className="text-xs text-muted font-mono">/{s.slug}</p>
        </div>
        <button
          type="button"
          className="btn-outline btn-sm"
          onClick={() => setShowPreview(true)}
        >
          <Eye size={16} />
          <span className="hidden sm:inline">{t("common.preview")}</span>
        </button>
      </div>

      {/* Статистика услуги */}
      <StatsBlock stats={stats} />

      {/* Вкладки */}
      <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto rounded-xl bg-paper p-1">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "relative rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap",
              tab === k ? "bg-ink text-inverse" : "text-muted",
            )}
          >
            {l}
            {tabHasErrors(k, s) && (
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-bad" />
            )}
          </button>
        ))}
      </div>

      {/* Вкладка «Основное» */}
      {tab === "main" && (
        <MainTab
          s={s}
          up={up}
          categories={categories}
          masters={masters}
          onCreateCategory={() => {
            setEditCatErr(undefined);
            setEditCat({ slug: "", title: {}, description: null, image: null, sort: categories.length, active: true, comingSoon: false, archived: false });
          }}
        />
      )}

      {/* Вкладка «Опции» */}
      {tab === "options" && (
        <OptionsTab s={s} up={up} setGroup={setGroup} setOpt={setOpt} />
      )}

      {/* Вкладка «Тарифы» */}
      {tab === "plans" && (
        <PlansTab s={s} up={up} setPlan={setPlan} rules={rules} />
      )}

      {/* Вкладка «Контент» */}
      {tab === "content" && (
        <ContentTab c={s.content} setContent={setContent} />
      )}

      <SaveBar onSave={save} pending={pending} saved={saved} error={error} isDirty={isDirty} onDiscard={discard} />

      {/* Кнопка удаления услуги */}
      <div className="mt-4">
        <button
          className="btn-danger"
          disabled={pending}
          onClick={() => {
            if (confirm(t("common.deleteConfirm")))
              start(async () => {
                const r = await deleteServiceAction(id);
                if (r.archived) alert(t("common.deleteBlocked"));
                router.push("/admin/services");
              });
          }}
        >
          {t("services.deleteService")}
        </button>
      </div>

      {/* Предпросмотр */}
      <Sheet open={showPreview} onClose={() => setShowPreview(false)} title={t("common.preview")}>
        <ServicePreview s={s} locale={locale} />
      </Sheet>

      {/* Создание категории */}
      <Sheet
        open={!!editCat}
        onClose={() => setEditCat(null)}
        title={t("services.addCategory")}
        footer={
          <button className="btn-primary w-full" disabled={editCatPending} onClick={saveCat}>
            {t("common.save")}
          </button>
        }
      >
        {editCat && (
          <div className="space-y-3">
            <I18nInput
              label={t("common.title")}
              required
              value={editCat.title}
              onChange={(v) => setEditCat({ ...editCat, title: v })}
            />
            <TextInput
              label={t("common.slug")}
              hint={t("common.slugHint")}
              value={editCat.slug}
              onChange={(v) => setEditCat({ ...editCat, slug: v })}
            />
            <Toggle label={t("common.active")} checked={editCat.active} onChange={(v) => setEditCat({ ...editCat, active: v })} />
            {editCatErr && <p className="text-sm text-bad">{editCatErr}</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}

// Предпросмотр услуги с текущим (несохранённым) состоянием
function ServicePreview({ s, locale }: { s: ServicePayload; locale: string }) {
  const t = useTranslations("admin");
  const title = tr(s.title, locale) || "—";
  const subtitle = tr(s.subtitle, locale);
  const description = tr(s.description, locale);
  const durGroup = s.groups.find((g) => g.isDuration && g.active);
  const prices = durGroup?.options.filter((o) => o.active).map((o) => o.price) ?? [];
  const minPrice = prices.length ? Math.min(...prices) : null;

  return (
    <div className="space-y-4">
      {s.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.image} alt="" className="max-h-56 w-full rounded-xl object-cover" />
      )}
      <div>
        <h2 className="h2">{title}</h2>
        {subtitle && <p className="text-muted">{subtitle}</p>}
        {minPrice !== null && <p className="mt-1 font-semibold">{t("services.minPrice", { price: minPrice })}</p>}
      </div>
      {description && <p className="text-sm">{description}</p>}
      {s.groups.length > 0 && (
        <div className="rounded-xl border border-line p-3">
          <p className="mb-2 text-sm font-medium text-muted">
            {t("services.previewOptions", {
              groups: s.groups.length,
              variants: s.groups.reduce((a, g) => a + g.options.length, 0),
            })}
          </p>
          {s.groups.slice(0, 3).map((g, i) => (
            <div key={i} className="text-sm">
              {tr(g.title, locale) || t("services.previewStep", { n: i + 1 })}
              {": "}
              {g.options.length}
            </div>
          ))}
        </div>
      )}
      {s.plans.length > 1 && (
        <div className="rounded-xl border border-line p-3">
          <p className="text-sm font-medium text-muted">{s.plans.length} {t("services.tabs.plans").toLowerCase()}</p>
        </div>
      )}
      {s.masterIds.length > 0 && (
        <p className="text-sm text-muted">{t("services.mastersSelected", { n: s.masterIds.length })}</p>
      )}
      {!s.active && (
        <div className="rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn">{t("services.draft")}</div>
      )}
    </div>
  );
}
