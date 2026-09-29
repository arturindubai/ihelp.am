"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Pencil } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { deleteBannerAction, saveBannerAction, type BannerPayload } from "@/server/actions/admin/misc";
import { bannerStatus, BANNER_DEFAULT_BG } from "@/lib/banner-select";
import { tr } from "@/i18n/locales";
import { Sheet } from "@/components/ui/Sheet";
import { I18nInput, ImageInput, NumInput, TextInput, Toggle } from "./fields";

/** Только места, подключённые в интерфейсе; остальные скрыты до реализации */
const PLACEMENTS = [
  "CAROUSEL_HOME",
  "HERO_HOME",
  "CATALOG",
  "SERVICE",
] as const;

const BANNER_TYPES = ["PROMO", "ANNOUNCEMENT", "UPSELL", "CROSS_SELL"] as const;
const AUDIENCES = ["ALL", "LOGGED_IN", "GUESTS"] as const;
const SEGMENTS = ["ALL", "NEW", "RETURNING"] as const;

type BannerItem = {
  id: string;
  data: BannerPayload & {
    views: number;
    clicks: number;
  };
};

type Props = {
  banners: BannerItem[];
};

const empty: BannerPayload = {
  title: {},
  subtitle: {},
  image: null,
  link: "",
  promoCode: "",
  bg: BANNER_DEFAULT_BG,
  active: true,
  sort: 0,
  placement: "CAROUSEL_HOME",
  bannerType: "PROMO",
  startsAt: null,
  endsAt: null,
  audience: "ALL",
  segment: "ALL",
};

function statusClass(s: "active" | "paused" | "scheduled" | "expired") {
  if (s === "active") return "bg-ok-50 text-ok";
  if (s === "paused") return "bg-surface text-muted";
  if (s === "scheduled") return "bg-warn-50 text-warn";
  return "bg-bad-50 text-bad";
}

/** "2026-09-28T12:00" → Date (интерпретируем как Ереван UTC+4); ISO строки из БД тоже принимаем */
function parseYerevanDatetime(s: string | null | undefined): Date | null {
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? new Date(`${s}:00+04:00`) : new Date(s);
}

/** Date → "2026-09-28T12:00" для input[type=datetime-local] */
function toDatetimeLocal(d: Date | null | undefined): string {
  if (!d) return "";
  const utc4 = new Date(d.getTime() + 4 * 3_600_000);
  return utc4.toISOString().slice(0, 16);
}

export function BannerManager({ banners }: Props) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [edit, setEdit] = useState<{ id: string | null; data: BannerPayload } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const d = edit?.data;
  const up = (p: Partial<BannerPayload>) => edit && setEdit({ ...edit, data: { ...edit.data, ...p } });

  const now = new Date();

  const editingBanner = edit?.id ? banners.find((b) => b.id === edit.id) : null;
  const statsViews = editingBanner?.data.views ?? 0;
  const statsClicks = editingBanner?.data.clicks ?? 0;
  const statsCtr = statsViews > 0 ? (statsClicks / statsViews) * 100 : null;

  const tabs: { key: string; label: string; count: number }[] = [
    { key: "ALL", label: `${t("banners.tabs.all")} (${banners.length})`, count: banners.length },
    ...PLACEMENTS.map((pl) => {
      const cnt = banners.filter((b) => b.data.placement === pl).length;
      return { key: pl, label: cnt > 0 ? `${t(`banners.placements.${pl}`)} (${cnt})` : t(`banners.placements.${pl}`), count: cnt };
    }),
  ];

  const visible = activeTab === "ALL" ? banners : banners.filter((b) => b.data.placement === activeTab);

  const openNew = () => {
    setSaveError(null);
    setEdit({ id: null, data: { ...empty, sort: banners.length, placement: activeTab !== "ALL" ? (activeTab as BannerPayload["placement"]) : "CAROUSEL_HOME" } });
  };

  return (
    <div>
      {/* шапка */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">{t("banners.title")}</h1>
        <button className="btn-dark flex items-center gap-1.5" onClick={openNew}>
          <Plus size={16} />
          {t("banners.newBanner")}
        </button>
      </div>

      {/* вкладки-фильтры */}
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`chip shrink-0 border transition ${
              activeTab === tab.key ? "bg-ink text-inverse border-ink" : "border-line bg-paper text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* список */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted">
          <span className="text-4xl opacity-30">🖼</span>
          <p className="text-sm">{t("banners.empty")}</p>
          <button className="btn-outline" onClick={openNew}>{t("banners.newBanner")}</button>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((b) => {
            const startsAt = b.data.startsAt ? parseYerevanDatetime(b.data.startsAt) : null;
            const endsAt = b.data.endsAt ? parseYerevanDatetime(b.data.endsAt) : null;
            const status = bannerStatus({ active: b.data.active, startsAt, endsAt }, now);
            const ctr = b.data.views > 0 ? (b.data.clicks / b.data.views) * 100 : null;

            return (
              <div
                key={b.id}
                className={`card flex items-center gap-3 overflow-hidden p-0 ${
                  status === "paused" || status === "expired" ? "opacity-60" : ""
                }`}
              >
                {/* превью */}
                <div
                  className="relative h-[100px] w-20 shrink-0 md:w-[100px]"
                  style={{ background: b.data.bg || BANNER_DEFAULT_BG }}
                >
                  <div className="flex h-full flex-col justify-end p-2">
                    <div className="truncate text-[11px] font-bold leading-tight text-inverse">{tr(b.data.title, locale) || "…"}</div>
                    {b.data.subtitle && <div className="truncate text-[10px] text-inverse/80">{tr(b.data.subtitle, locale)}</div>}
                  </div>
                </div>

                {/* тело */}
                <div className="min-w-0 flex-1 py-2 pr-2">
                  <div className="truncate font-medium text-ink">{tr(b.data.title, locale) || "…"}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="chip bg-brand-50 text-brand text-[11px]">{t(`banners.placements.${b.data.placement}`)}</span>
                    <span className={`chip text-[11px] ${statusClass(status)}`}>{t(`banners.status.${status}`)}</span>
                    {(b.data.startsAt || b.data.endsAt) && (
                      <span className="chip border-line bg-paper text-muted text-[11px]">
                        {b.data.startsAt ? toDatetimeLocal(parseYerevanDatetime(b.data.startsAt)).slice(0, 10) : "…"}
                        {" — "}
                        {b.data.endsAt ? toDatetimeLocal(parseYerevanDatetime(b.data.endsAt)).slice(0, 10) : "∞"}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex gap-3 text-[12px] text-muted">
                    <span>{t("banners.views")}: {b.data.views}</span>
                    <span>{t("banners.clicks")}: {b.data.clicks}</span>
                    <span className={ctr === null ? "" : ctr > 3 ? "text-ok" : ctr < 1 ? "text-warn" : ""}>
                      CTR: {ctr === null ? "—" : `${ctr.toFixed(1)}%`}
                    </span>
                  </div>
                </div>

                {/* карандаш */}
                <button
                  className="mr-2 shrink-0 grid h-8 w-8 place-items-center rounded-lg border border-line bg-paper text-muted hover:text-ink"
                  onClick={() => { setSaveError(null); setEdit({ id: b.id, data: b.data }); }}
                >
                  <Pencil size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* форма (Sheet) */}
      <Sheet
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? t("common.edit") : t("banners.newBanner")}
        footer={
          <div className="flex gap-2">
            {edit?.id && (
              <button
                className="btn-danger"
                disabled={pending}
                onClick={() =>
                  confirm(t("common.deleteConfirm")) &&
                  start(async () => {
                    await deleteBannerAction(edit.id!);
                    setEdit(null);
                    router.refresh();
                  })
                }
              >
                {t("common.delete")}
              </button>
            )}
            <button className="btn-outline" onClick={() => setEdit(null)}>{t("common.cancel")}</button>
            <button
              className="btn-primary flex-1"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setSaveError(null);
                  const res = await saveBannerAction(edit!.id, edit!.data);
                  if (!res.ok) { setSaveError(t("common.error")); return; }
                  setEdit(null);
                  router.refresh();
                })
              }
            >
              {t("common.save")}
            </button>
          </div>
        }
      >
        {d && (
          <div className="space-y-4">
            {/* живой предпросмотр */}
            <div
              className="relative flex h-[100px] flex-col justify-end overflow-hidden rounded-[14px] p-3 text-inverse"
              style={{ background: d.bg || BANNER_DEFAULT_BG }}
            >
              <div className="relative">
                <div className="text-sm font-bold leading-snug">{tr(d.title, locale) || "…"}</div>
                {tr(d.subtitle, locale) && <div className="mt-0.5 text-xs opacity-80">{tr(d.subtitle, locale)}</div>}
                {d.promoCode && (
                  <span className="mt-1.5 inline-block rounded-md bg-paper px-2 py-0.5 font-mono text-xs font-bold uppercase text-ink">
                    {d.promoCode}
                  </span>
                )}
              </div>
            </div>

            {/* секция: Основное */}
            <div className="rounded-xl bg-surface p-3 space-y-3">
              <div>
                <label className="label">{t("banners.placement")}</label>
                <select className="input" value={d.placement} onChange={(e) => up({ placement: e.target.value as BannerPayload["placement"] })}>
                  {PLACEMENTS.map((pl) => (
                    <option key={pl} value={pl}>{t(`banners.placements.${pl}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">{t("banners.type")}</label>
                <select className="input" value={d.bannerType} onChange={(e) => up({ bannerType: e.target.value as BannerPayload["bannerType"] })}>
                  {BANNER_TYPES.map((bt) => (
                    <option key={bt} value={bt}>{t(`banners.types.${bt}`)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* секция: Тексты */}
            <div className="rounded-xl bg-surface p-3 space-y-3">
              <I18nInput label={t("common.title")} value={d.title} onChange={(v) => up({ title: v })} />
              <I18nInput label={t("common.subtitle")} value={d.subtitle ?? {}} onChange={(v) => up({ subtitle: v })} />
              <TextInput label={t("banners.promoCode")} value={d.promoCode} onChange={(v) => up({ promoCode: v.toUpperCase() })} className="font-mono uppercase" />
              <TextInput label={t("banners.link")} placeholder="/s/regular-cleaning" value={d.link} onChange={(v) => up({ link: v })} />
            </div>

            {/* секция: Внешний вид */}
            <div className="rounded-xl bg-surface p-3 space-y-3">
              <div>
                <label className="label">{t("banners.bg")}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-line"
                    value={d.bg || BANNER_DEFAULT_BG}
                    onChange={(e) => up({ bg: e.target.value })}
                  />
                  <input
                    type="text"
                    className="input font-mono uppercase"
                    value={d.bg || ""}
                    placeholder={BANNER_DEFAULT_BG}
                    maxLength={7}
                    onChange={(e) => up({ bg: e.target.value })}
                  />
                </div>
              </div>
              <ImageInput label={t("common.image")} value={d.image} onChange={(v) => up({ image: v })} />
            </div>

            {/* секция: Расписание и аудитория */}
            <div className="rounded-xl bg-surface p-3 space-y-3">
              <Toggle label={t("common.active")} checked={d.active} onChange={(v) => up({ active: v })} />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="label">{t("banners.startsAt")}</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={d.startsAt ? (d.startsAt.length === 16 ? d.startsAt : toDatetimeLocal(new Date(d.startsAt))) : ""}
                    onChange={(e) => up({ startsAt: e.target.value || null })}
                  />
                </div>
                <div className="flex-1">
                  <label className="label">{t("banners.endsAt")}</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={d.endsAt ? (d.endsAt.length === 16 ? d.endsAt : toDatetimeLocal(new Date(d.endsAt))) : ""}
                    onChange={(e) => up({ endsAt: e.target.value || null })}
                  />
                </div>
              </div>
              <div>
                <label className="label">{t("banners.audience")}</label>
                <select className="input" value={d.audience} onChange={(e) => up({ audience: e.target.value as BannerPayload["audience"] })}>
                  {AUDIENCES.map((a) => <option key={a} value={a}>{t(`banners.audiences.${a}`)}</option>)}
                </select>
              </div>
              <div>
                <label className="label">{t("banners.segment")}</label>
                <select className="input" value={d.segment} onChange={(e) => up({ segment: e.target.value as BannerPayload["segment"] })}>
                  {SEGMENTS.map((s) => <option key={s} value={s}>{t(`banners.segments.${s}`)}</option>)}
                </select>
              </div>
              <NumInput label={t("common.sort")} value={d.sort} onChange={(v) => up({ sort: v ?? 0 })} className="max-w-[120px]" />
            </div>

            {saveError && (
              <p className="rounded-xl bg-bad-50 px-3 py-2 text-sm text-bad">{saveError}</p>
            )}

            {/* секция: Статистика (только для существующих баннеров) */}
            {edit?.id && (
              <div className="rounded-xl p-3">
                <p className="label mb-2">{t("banners.stats")}</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-[10px] bg-surface p-2 text-center">
                    <div className="text-[11px] text-muted">{t("banners.views")}</div>
                    <div className="text-sm font-semibold text-ink">{statsViews}</div>
                  </div>
                  <div className="rounded-[10px] bg-surface p-2 text-center">
                    <div className="text-[11px] text-muted">{t("banners.clicks")}</div>
                    <div className="text-sm font-semibold text-ink">{statsClicks}</div>
                  </div>
                  <div className="rounded-[10px] bg-surface p-2 text-center">
                    <div className="text-[11px] text-muted">{t("banners.ctr")}</div>
                    <div
                      className={`text-sm font-semibold ${
                        statsCtr === null ? "text-muted" : statsCtr > 3 ? "text-ok" : statsCtr < 1 ? "text-warn" : "text-ink"
                      }`}
                    >
                      {statsCtr === null ? "—" : `${statsCtr.toFixed(1)}%`}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
