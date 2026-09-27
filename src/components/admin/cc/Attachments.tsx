"use client";
import { useRef, useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ccDeleteAttachmentAction } from "@/server/actions/admin/cc";
import { ImageViewer, type GalleryImage } from "@/components/admin/cc/ImageGallery";
import { dateLabel } from "@/lib/format";

export interface AttachmentValue {
  id: string;
  fileName: string;
  url: string;
  size: number;
  mime: string;
  uploadedBy: string;
  createdAt: string | Date;
}

const humanSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`);

/** Файлы, прикреплённые к задаче или эпику: список, загрузка, удаление */
export function Attachments({ subject, items }: { subject: { taskKey?: string; epicKey?: string }; items: AttachmentValue[] }) {
  const t = useTranslations("admin.cc");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [multiFileSkipped, setMultiFileSkipped] = useState(false);
  const [viewIndex, setViewIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const imageItems: GalleryImage[] = items
    .filter((a) => a.mime.startsWith("image/"))
    .map((a) => ({ url: a.url, fileName: a.fileName }));
  const n = imageItems.length;

  const upload = (file: File) =>
    start(async () => {
      setError(null);
      setMultiFileSkipped(false);
      const form = new FormData();
      form.set("file", file);
      if (subject.taskKey) form.set("taskKey", subject.taskKey);
      if (subject.epicKey) form.set("epicKey", subject.epicKey);
      const r = await fetch("/api/cc/upload", { method: "POST", body: form });
      const json = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !json.ok) {
        setError(t.has(`form.uploadErrors.${json.error}`) ? t(`form.uploadErrors.${json.error}` as "form.uploadErrors.type") : t("form.uploadErrors.error"));
        return;
      }
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const { files } = e.dataTransfer;
    if (!files.length) return;
    if (files.length > 1) setMultiFileSkipped(true);
    upload(files[0]);
  };

  return (
    <div>
      {items.length === 0 && <p className="text-sm text-muted">{t("form.noFiles")}</p>}
      <ul className="space-y-2">
        {items.map((a) => {
          const isImage = a.mime.startsWith("image/");
          const galleryIdx = isImage ? imageItems.findIndex((im) => im.url === a.url) : -1;
          const uploadedDate = dateLabel(new Date(a.createdAt), locale, { day: "numeric", month: "short" });
          return (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              {isImage && (
                <button
                  className="shrink-0 overflow-hidden rounded-[var(--radius-card)] border border-line"
                  onClick={() => setViewIndex(galleryIdx)}
                  title={a.fileName}
                >
                  <img src={a.url} alt={a.fileName} className="block h-12 w-12 object-cover" />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <a href={a.url} target="_blank" rel="noreferrer" className="block truncate text-brand hover:underline">
                  {a.fileName}
                </a>
                <span className="text-xs text-muted">
                  {humanSize(a.size)} · {a.uploadedBy} · {uploadedDate}
                </span>
              </div>
              <button
                className="btn-ghost btn-sm shrink-0 px-2 text-bad"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await ccDeleteAttachmentAction(a.id);
                    router.refresh();
                  })
                }
              >
                {t("form.delete")}
              </button>
            </li>
          );
        })}
      </ul>
      {viewIndex >= 0 && (
        <ImageViewer
          images={imageItems}
          index={viewIndex}
          onClose={() => setViewIndex(-1)}
          onPrev={() => setViewIndex((i) => (i - 1 + n) % n)}
          onNext={() => setViewIndex((i) => (i + 1) % n)}
        />
      )}
      <div
        className={[
          "mt-3 rounded-lg border border-dashed p-3 transition-colors",
          dragOver ? "border-brand bg-brand-50" : "border-line",
        ].join(" ")}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
        onDrop={handleDrop}
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            className="text-sm"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <span className="text-sm text-muted">
            {dragOver ? t("form.dropActive") : t("form.dropHint")}
          </span>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
      {multiFileSkipped && !error && <p className="mt-2 text-xs text-warn">{t("form.multiFileSkipped")}</p>}
      <p className="mt-1 text-xs text-muted">{t("form.uploadHint")}</p>
    </div>
  );
}
