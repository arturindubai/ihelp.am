"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Следит за версией сборки: раз в минуту и при возврате на вкладку спрашивает /api/version.
 * Сайт обновился — баннер с кнопкой «Обновить», пока человек не нажал. Черновики Intake переживают обновление
 */
export function VersionWatch({ initial }: { initial: string }) {
  const t = useTranslations("admin.version");
  const [stale, setStale] = useState(false);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const j = (await r.json()) as { build?: string };
        if (!stop && j.build && j.build !== initial) setStale(true);
      } catch {
        /* сеть моргнула — проверим в следующий раз */
      }
    };
    const id = setInterval(check, 60_000);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [initial]);
  if (!stale) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex flex-wrap items-center justify-center gap-3 bg-ink px-4 py-3 text-sm text-inverse shadow-xl">
      <span>{t("stale")}</span>
      <button className="btn-primary btn-sm" onClick={() => window.location.reload()}>
        {t("reload")}
      </button>
    </div>
  );
}
