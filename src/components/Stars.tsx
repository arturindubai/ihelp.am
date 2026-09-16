import { Star } from "lucide-react";

export function Rating({ value, count, label }: { value: number; count?: number; label?: string }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-ink">
      <Star size={14} className="fill-ink stroke-ink" />
      <span className="font-semibold">{value.toFixed(2)}</span>
      {label && <span className="text-muted">({label})</span>}
    </span>
  );
}

export function StarRow({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={i <= Math.round(value) ? "fill-brand stroke-brand" : "stroke-line"} />
      ))}
    </span>
  );
}
