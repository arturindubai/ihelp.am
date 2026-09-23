"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/** Сворачиваемый блок — по умолчанию закрыт, чтобы не занимать экран целиком до списка задач */
export function Collapsible({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-4">
      <button type="button" className="btn-outline btn-sm inline-flex items-center gap-1.5" onClick={() => setOpen((v) => !v)}>
        {title}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
