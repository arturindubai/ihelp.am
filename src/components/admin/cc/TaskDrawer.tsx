"use client";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { X, Maximize2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";

/**
 * Шторка с карточкой задачи поверх списка или доски: клик по задаче открывает всё по ней,
 * не теряя фильтров. Адрес с ?task=КЛЮЧ можно переслать — откроется та же шторка
 */
export function TaskDrawer({ closeHref, pageHref, children }: { closeHref: string; pageHref: string; children: React.ReactNode }) {
  const t = useTranslations("admin.cc");
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(closeHref, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [closeHref, router]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <Link href={closeHref} scroll={false} className="absolute inset-0 bg-overlay/40" aria-label={t("drawer.close")} />
      <div className="absolute inset-y-0 right-0 w-full max-w-4xl overflow-y-auto bg-paper p-4 shadow-xl sm:p-6">
        <div className="mb-2 flex justify-end gap-1">
          <Link href={pageHref} className="btn-ghost btn-sm px-2" aria-label={t("drawer.openPage")} title={t("drawer.openPage")}>
            <Maximize2 size={16} />
          </Link>
          <Link href={closeHref} scroll={false} className="btn-ghost btn-sm px-2" aria-label={t("drawer.close")} title={t("drawer.close")}>
            <X size={18} />
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
