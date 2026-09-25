"use client";
import { useEffect } from "react";
import { useTranslations } from "next-intl";

/**
 * Ошибка в админке вместо «Application error» на весь экран: чаще всего это устаревшая после выкладки вкладка.
 * Кнопка обновляет страницу; черновик Intake сохранён в браузере и вернётся
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("admin.errorPage");
  useEffect(() => {
    console.error("[admin]", error);
  }, [error]);
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <div className="mb-2 text-lg font-bold">{t("title")}</div>
      <p className="mb-4 text-sm text-muted">{t("hint")}</p>
      <div className="flex justify-center gap-2">
        <button className="btn-primary" onClick={() => window.location.reload()}>
          {t("reload")}
        </button>
        <button className="btn-outline" onClick={reset}>
          {t("retry")}
        </button>
      </div>
      {error.digest && <p className="mt-4 font-mono text-[11px] text-muted">{error.digest}</p>}
    </div>
  );
}
