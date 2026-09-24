"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ccLibraryArchiveAction, ccLibraryCreateAction, ccLibraryRestoreAction, ccLibraryUpdateAction } from "@/server/actions/admin/cc";
import { LIBRARY_KINDS } from "@/lib/library";

/** Новая запись или правка своей записи Библиотеки. Каждое сохранение — новая версия, старые остаются */
export function LibraryEditor({ mode, slug, initial, doneHref }: { mode: "create" | "edit"; slug?: string; initial?: { title: string; content: string; kind: string }; doneHref?: string }) {
  const t = useTranslations("admin.cc.library");
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState(initial?.kind ?? "knowledge");
  const [content, setContent] = useState(initial?.content ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      if (mode === "create") {
        const r = await ccLibraryCreateAction({ title, kind: kind as (typeof LIBRARY_KINDS)[number], content });
        if (!r.ok) return setError(t("saveFailed"));
        router.push(`/admin/control/library?doc=${encodeURIComponent(r.slug)}`);
      } else {
        const r = await ccLibraryUpdateAction(slug!, { title, content, note });
        if (!r.ok) return setError(t("saveFailed"));
        router.push(doneHref ?? "/admin/control/library");
      }
      router.refresh();
    });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input id="lib-title" className="input h-10 min-w-0 flex-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePh")} />
        {mode === "create" && (
          <select id="lib-kind" className="input h-10 w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
            {LIBRARY_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        )}
      </div>
      <textarea id="lib-content" className="input min-h-80 w-full font-mono text-[13px] leading-relaxed" value={content} onChange={(e) => setContent(e.target.value)} placeholder={t("contentPh")} />
      {mode === "edit" && <input id="lib-note" className="input h-10 w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePh")} />}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary btn-sm" disabled={pending || !content.trim()}>
          {pending ? t("saving") : mode === "create" ? t("create") : t("saveVersion")}
        </button>
        {doneHref && (
          <Link href={doneHref} className="btn-ghost btn-sm">
            {t("cancel")}
          </Link>
        )}
        <span className="text-xs text-muted">{t("markdownHint")}</span>
      </div>
      {error && <p className="rounded-lg bg-bad-50 px-3 py-2 text-xs text-bad">{error}</p>}
    </form>
  );
}

/** Действия с записью команды: изменить, вернуть эту (старую) версию, в архив или обратно */
export function LibraryDocActions({ slug, n, isLatest, archived, editHref }: { slug: string; n: number; isLatest: boolean; archived: boolean; editHref: string }) {
  const t = useTranslations("admin.cc.library");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<{ ok: boolean }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(t("saveFailed"));
      router.push(`/admin/control/library?doc=${encodeURIComponent(slug)}`);
      router.refresh();
    });
  return (
    <>
      {isLatest && !archived && (
        <Link href={editHref} className="btn-outline btn-sm">
          {t("edit")}
        </Link>
      )}
      {!isLatest && (
        <button className="btn-primary btn-sm" disabled={pending} onClick={() => act(() => ccLibraryRestoreAction(slug, n))}>
          {t("restore", { n })}
        </button>
      )}
      <button className="btn-ghost btn-sm" disabled={pending} onClick={() => act(() => ccLibraryArchiveAction(slug, !archived))}>
        {archived ? t("unarchive") : t("archive")}
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </>
  );
}
