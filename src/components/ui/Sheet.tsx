"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

/** Нижняя шторка на мобильных, модальное окно на десктопе */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  const tc = useTranslations("common");
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button aria-label={tc("close")} className="absolute inset-0 bg-overlay/50" onClick={onClose} />
      <div className="relative flex max-h-[88dvh] w-full flex-col rounded-t-3xl bg-paper sm:max-w-[520px] sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
          <div className="h2 pt-1">{title}</div>
          <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full bg-surface" aria-label={tc("close")}>
            <X size={18} />
          </button>
        </div>
        <div className={`overflow-y-auto px-4 ${footer ? "pb-4" : "pb-safe"}`}>{children}</div>
        {footer && <div className="pb-safe border-t border-line px-4 pt-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
