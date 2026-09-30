"use client";

import { useState, useEffect } from "react";
import { MapPin, ChevronDown } from "lucide-react";
import { AddressSheet } from "./AddressSheet";

const STORAGE_KEY = "ihelp_district";

type Props = {
  cityLabel: string;
  sheetTitle: string;
  anyLabel: string;
};

export function AddressChip({ cityLabel, sheetTitle, anyLabel }: Props) {
  const [district, setDistrict] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setDistrict(saved);
    } catch {}
  }, []);

  function handleSelect(d: string | null) {
    setDistrict(d);
    try {
      if (d) localStorage.setItem(STORAGE_KEY, d);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  if (!mounted) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-sm transition hover:bg-surface cursor-pointer"
      >
        <MapPin size={14} className="text-brand shrink-0" />
        <span className="truncate max-w-[120px]">
          {district ? `${cityLabel} · ${district}` : cityLabel}
        </span>
        <ChevronDown size={14} className="text-muted shrink-0" />
      </button>
      <AddressSheet
        open={open}
        onClose={() => setOpen(false)}
        selected={district}
        onSelect={handleSelect}
        title={sheetTitle}
        anyLabel={anyLabel}
      />
    </>
  );
}
