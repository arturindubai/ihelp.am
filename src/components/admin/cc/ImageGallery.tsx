"use client";
import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

export interface GalleryImage {
  url: string;
  fileName: string;
  label?: string;
}

/** Лайтбокс поверх страницы: Esc, крестик, клик мимо, стрелки, открыть в новой вкладке */
export function ImageViewer({
  images,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  images: GalleryImage[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("admin.cc.imageViewer");
  const img = images[index];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext]);

  if (!img) return null;
  const n = images.length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-overlay/80" onClick={onClose} aria-label={t("close")} />
      <div className="relative z-10 flex max-h-screen flex-col items-center px-4">
        <div className="mb-2 flex w-full items-center justify-between gap-4">
          <a href={img.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-inverse/80 hover:text-inverse">
            <ExternalLink size={14} /> {t("openNew")}
          </a>
          <button className="p-1 text-inverse/80 hover:text-inverse" onClick={onClose} aria-label={t("close")}>
            <X size={22} />
          </button>
        </div>
        <div className="flex items-center gap-3">
          {n > 1 && (
            <button className="shrink-0 rounded-full bg-overlay/60 p-2 text-inverse/80 hover:text-inverse" onClick={onPrev} aria-label={t("prev")}>
              <ChevronLeft size={22} />
            </button>
          )}
          <img src={img.url} alt={img.fileName} className="max-h-[80vh] max-w-[80vw] rounded-xl object-contain shadow-2xl" />
          {n > 1 && (
            <button className="shrink-0 rounded-full bg-overlay/60 p-2 text-inverse/80 hover:text-inverse" onClick={onNext} aria-label={t("next")}>
              <ChevronRight size={22} />
            </button>
          )}
        </div>
        {(img.label || n > 1) && (
          <p className="mt-2 text-xs text-inverse/60">
            {img.label}
            {n > 1 && ` · ${index + 1} / ${n}`}
          </p>
        )}
      </div>
    </div>
  );
}

/** Сетка миниатюр с лайтбоксом. Высота миниатюры до 160 px, скруглённые углы токеном темы, рамка border-line */
export function ImageGallery({ images }: { images: GalleryImage[] }) {
  const [open, setOpen] = useState(-1);
  const n = images.length;

  const handleClose = useCallback(() => setOpen(-1), []);
  const handlePrev = useCallback(() => setOpen((i) => (i - 1 + n) % n), [n]);
  const handleNext = useCallback(() => setOpen((i) => (i + 1) % n), [n]);

  if (!n) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {images.map((img, i) => (
          <button
            key={`${img.url}-${i}`}
            onClick={() => setOpen(i)}
            className="relative overflow-hidden rounded-[var(--radius-card)] border border-line"
            title={img.fileName}
          >
            <img src={img.url} alt={img.fileName} className="block h-40 max-w-[160px] object-cover" />
            {img.label && (
              <span className="absolute bottom-0 left-0 right-0 bg-overlay/50 px-2 py-0.5 text-center text-[10px] text-inverse">
                {img.label}
              </span>
            )}
          </button>
        ))}
      </div>
      {open >= 0 && (
        <ImageViewer images={images} index={open} onClose={handleClose} onPrev={handlePrev} onNext={handleNext} />
      )}
    </>
  );
}
