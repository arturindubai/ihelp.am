"use client";
import { useEffect } from "react";
import { X } from "lucide-react";

/** Нижняя шторка на мобильных, модальное окно на десктопе */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
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
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button aria-label="close" className="absolute inset-0 bg-overlay/50" onClick={onClose} />
      <div className="relative flex max-h-[88dvh] w-full flex-col rounded-t-3xl bg-paper sm:max-w-[520px] sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
          <div className="h2 pt-1">{title}</div>
          <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full bg-surface" aria-label="close">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="pb-safe border-t border-line px-4 pt-3">{footer}</div>}
      </div>
    </div>
  );
}
