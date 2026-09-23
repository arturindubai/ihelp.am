"use client";
import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ccDeleteAttachmentAction } from "@/server/actions/admin/cc";

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
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const upload = (file: File) =>
    start(async () => {
      setError(null);
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

  return (
    <div>
      {items.length === 0 && <p className="text-sm text-muted">{t("form.noFiles")}</p>}
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
            <a href={a.url} target="_blank" rel="noreferrer" className="truncate text-brand hover:underline">
              {a.fileName}
            </a>
            <span className="shrink-0 text-xs text-muted">
              {humanSize(a.size)} · {a.uploadedBy}
            </span>
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
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2">
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
      </div>
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
      <p className="mt-1 text-xs text-muted">{t("form.uploadHint")}</p>
    </div>
  );
}
