import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageUser } from "@/server/adminPage";
import { getLibraryDoc, libraryCounts, listLibrary } from "@/server/services/library";
import { CANON_SECTION_KEYS, CANON_SECTIONS, type CanonSection, diffHunks, diffLines, diffStat } from "@/lib/library";
import { Forbidden } from "@/components/admin/ui";
import { CcHeader } from "@/components/admin/cc/CcHeader";
import { Markdown } from "@/components/admin/cc/Markdown";
import { LibraryDocActions, LibraryEditor } from "@/components/admin/cc/LibraryEditor";
import { cn, dateLabel, timeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

type Search = { doc?: string; v?: string; cmp?: string; q?: string; section?: string; kind?: string; archived?: string; edit?: string; new?: string };

/** Обратный маппинг: kind → section (для обратной совместимости с ?kind=decision) */
const KIND_TO_SECTION: Record<string, CanonSection> = Object.fromEntries(
  Object.entries(CANON_SECTIONS).flatMap(([section, kinds]) => kinds.map((k) => [k, section as CanonSection])),
);

const KIND_TONE: Record<string, string> = {
  rules: "bg-bad-50 text-bad",
  role: "bg-brand-50 text-brand",
  process: "bg-ok-50 text-ok",
  decision: "bg-warn-50 text-warn",
  spec: "bg-brand-100 text-brand-600",
  knowledge: "bg-surface text-ink",
};

function href(sp: Search, patch: Search) {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next[k] = v;
  const qs = new URLSearchParams(next).toString();
  return `/admin/control/library${qs ? `?${qs}` : ""}`;
}

/**
 * Канон — одно место для решений, правил, дизайна, исследований и документов команды.
 * Документы репозитория снимаются при каждой выкладке, записи команды ведутся здесь.
 */
export default async function LibraryPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Search> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await pageUser("control"))) return <Forbidden />;
  const sp = await searchParams;
  const t = await getTranslations("admin.cc.library");
  const sectionFromKind = sp.kind ? KIND_TO_SECTION[sp.kind] : undefined;
  const section = (CANON_SECTION_KEYS as string[]).includes(sp.section ?? "") ? (sp.section as CanonSection) : sectionFromKind;
  const [list, counts] = await Promise.all([listLibrary({ q: sp.q, kinds: section !== undefined ? CANON_SECTIONS[section] : undefined, archived: sp.archived === "1" }), libraryCounts()]);
  const n = Number(sp.v) || undefined;
  const cmp = Number(sp.cmp) || undefined;
  const data = sp.doc ? await getLibraryDoc(sp.doc, n, cmp) : null;
  const when = (d: Date) => `${dateLabel(d, locale, { day: "numeric", month: "short", year: "numeric" })}, ${timeLabel(d)}`;
  const base = { q: sp.q, section: sp.section, archived: sp.archived };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const sectionCounts: Record<CanonSection, number> = {
    decisions: counts["decision"] ?? 0,
    rules: (counts["rules"] ?? 0) + (counts["role"] ?? 0) + (counts["process"] ?? 0),
    design: counts["spec"] ?? 0,
    research: counts["knowledge"] ?? 0,
    docs: 0,
  };

  const listPanel = (
    <aside className={cn("space-y-3 lg:block", sp.doc || sp.new ? "hidden" : "block")}>
      <form action={`/${locale}/admin/control/library`} className="flex gap-2">
        {sp.section && <input type="hidden" name="section" value={sp.section} />}
        <input name="q" defaultValue={sp.q ?? ""} placeholder={t("search")} className="input h-9 flex-1 py-1 text-sm" />
      </form>
      <div className="flex gap-1.5 overflow-x-auto flex-nowrap">
        <Link href={href({ q: sp.q }, {})} className={cn("chip text-xs shrink-0", !section ? "bg-ink text-inverse" : "bg-surface text-ink")}>
          {t("all")} <b className="ml-1">{total}</b>
        </Link>
        {CANON_SECTION_KEYS.map((s) => (
          <Link key={s} href={href({ q: sp.q }, { section: section === s ? "" : s })} className={cn("chip text-xs shrink-0", section === s ? "bg-ink text-inverse" : "bg-surface text-ink")}>
            {t(`sections.${s}`)} <b className="ml-1">{sectionCounts[s]}</b>
          </Link>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <Link href={href(base, { archived: sp.archived ? "" : "1", doc: "" })} className="text-muted hover:underline">
          {sp.archived ? t("showActive") : t("showArchived")}
        </Link>
        <Link href={href(base, { new: "1", doc: "" })} className="btn-primary btn-sm">
          {t("new")}
        </Link>
      </div>
      <ul className="card divide-y divide-line overflow-hidden">
        {list.length === 0 && <li className="p-4 text-sm text-muted">{sp.q ? t("notFound") : section ? t("emptySection") : t("empty")}</li>}
        {list.map((d) => (
          <li key={d.slug}>
            <Link href={href(base, { doc: d.slug })} className={cn("block px-3 py-2.5 hover:bg-surface", sp.doc === d.slug && "bg-brand-50")}>
              <span className="block line-clamp-1 text-sm font-medium">{d.title}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                <span className={cn("chip text-[10px]", KIND_TONE[d.kind])}>{t(`kinds.${d.kind}` as "kinds.rules")}</span>
                {d.source === "repo" ? <span className="font-mono">{d.path}</span> : <span>{t("teamNote")}</span>}
                <span>· v{d.version}</span>
              </span>
              {d.hit && <span className="mt-1 block line-clamp-2 text-xs text-muted">{d.hit}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );

  let detail: React.ReactNode = <div className="card hidden p-10 text-center text-sm text-muted lg:block">{t("pick")}</div>;
  if (sp.new) {
    detail = (
      <section className="card p-4">
        <Link href={href(base, { new: "" })} className="mb-3 inline-block text-sm text-brand lg:hidden">
          ← {t("backToList")}
        </Link>
        <h2 className="mb-3 text-lg font-semibold">{t("newTitle")}</h2>
        <LibraryEditor mode="create" />
      </section>
    );
  } else if (sp.doc && !data) {
    detail = <div className="card p-10 text-center text-sm text-muted">{t("notFoundDoc")}</div>;
  } else if (data?.current) {
    const { doc, current, other } = data;
    const isLatest = current.n === doc.version;
    const ops = other ? diffLines(other.content, current.content) : null;
    const stat = ops ? diffStat(ops) : null;
    detail = (
      <section className="space-y-4">
        <Link href={href(base, { doc: "" })} className="inline-block text-sm text-brand lg:hidden">
          ← {t("backToList")}
        </Link>
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={cn("chip text-[10px]", KIND_TONE[doc.kind])}>{t(`kinds.${doc.kind}` as "kinds.rules")}</span>
            <span className="chip bg-surface text-[10px] text-muted">{doc.source === "repo" ? t("fromRepo") : t("teamNote")}</span>
            {doc.archived && <span className="chip bg-warn-50 text-[10px] text-warn">{t("archived")}</span>}
            <span className={cn("chip text-[10px]", isLatest ? "bg-ok-50 text-ok" : "bg-warn-50 text-warn")}>{isLatest ? t("latest", { n: current.n }) : t("oldVersion", { n: current.n, total: doc.version })}</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{current.title}</h1>
          <p className="text-sm text-muted">
            {doc.path && <span className="font-mono">{doc.path} · </span>}
            {t("versionBy", { when: when(current.createdAt), who: current.author })}
            {current.note ? ` · ${current.note}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`/api/cc/library?slug=${encodeURIComponent(doc.slug)}&v=${current.n}`} className="btn-outline btn-sm">
              {t("download")}
            </a>
            {current.n > 1 && !other && (
              <Link href={href(base, { doc: doc.slug, v: String(current.n), cmp: String(current.n - 1) })} className="btn-outline btn-sm">
                {t("comparePrev")}
              </Link>
            )}
            {other && (
              <Link href={href(base, { doc: doc.slug, v: String(current.n) })} className="btn-outline btn-sm">
                {t("closeCompare")}
              </Link>
            )}
            {doc.source === "admin" && <LibraryDocActions slug={doc.slug} n={current.n} isLatest={isLatest} archived={doc.archived} editHref={href(base, { doc: doc.slug, edit: "1" })} />}
          </div>
          {doc.source === "repo" && <p className="mt-2 text-xs text-muted">{t("repoHint")}</p>}
        </div>

        {sp.edit && doc.source === "admin" && isLatest ? (
          <div className="card p-4">
            <LibraryEditor mode="edit" slug={doc.slug} initial={{ title: current.title, content: current.content, kind: doc.kind }} doneHref={href(base, { doc: doc.slug })} />
          </div>
        ) : ops && other ? (
          <div className="card overflow-hidden">
            <div className="border-b border-line bg-surface/60 px-4 py-2 text-sm">
              {t("compareTitle", { from: other.n, to: current.n })} <span className="text-ok">+{stat!.added}</span> <span className="text-bad">−{stat!.removed}</span>
            </div>
            <div className="overflow-x-auto font-mono text-[12px] leading-snug">
              {diffHunks(ops).map((o, i) =>
                o.op === "skip" ? (
                  <div key={i} className="bg-surface/60 px-4 py-1 text-muted">
                    {t("skipped", { n: o.count })}
                  </div>
                ) : (
                  <div key={i} className={cn("whitespace-pre-wrap px-4", o.op === "add" && "bg-ok-50 text-ok", o.op === "del" && "bg-bad-50 text-bad")}>
                    {o.op === "add" ? "+ " : o.op === "del" ? "− " : "  "}
                    {o.text || " "}
                  </div>
                ),
              )}
            </div>
          </div>
        ) : (
          <article className="card p-5">
            <Markdown source={current.content} docPath={doc.path} />
          </article>
        )}

        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">{t("versions", { n: doc.versions.length })}</h2>
          <ul className="divide-y divide-line text-sm">
            {doc.versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
                <Link href={href(base, { doc: doc.slug, v: String(v.n) })} className={cn("font-mono text-xs", v.n === current.n ? "font-bold text-ink" : "text-brand hover:underline")}>
                  v{v.n}
                </Link>
                <span className="text-xs text-muted">
                  {when(v.createdAt)} · {v.author}
                  {v.note ? ` · ${v.note}` : ""}
                </span>
                {v.n > 1 && (
                  <Link href={href(base, { doc: doc.slug, v: String(v.n), cmp: String(v.n - 1) })} className="text-xs text-brand hover:underline">
                    {t("diffPrev")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  return (
    <div className="max-w-6xl">
      <CcHeader page="library" locale={locale} />
      <h2 className="text-2xl font-bold tracking-tight text-ink">{t("title")}</h2>
      <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        {listPanel}
        <div className={cn(!sp.doc && !sp.new && "hidden lg:block")}>{detail}</div>
      </div>
    </div>
  );
}
