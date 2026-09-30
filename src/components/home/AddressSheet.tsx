"use client";

import { useState } from "react";
import { Search, Check } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";

const DISTRICTS = [
  "Центр",
  "Аван",
  "Давиташен",
  "Малатия-Себастия",
  "Нор-Норк",
  "Нубарашен",
  "Арабкир",
  "Канакер-Зейтун",
  "Эребуни",
  "Шенгавит",
  "Аджапняк",
];

type Props = {
  open: boolean;
  onClose: () => void;
  selected: string | null;
  onSelect: (district: string | null) => void;
  title: string;
  anyLabel: string;
  searchPlaceholder: string;
};

export function AddressSheet({ open, onClose, selected, onSelect, title, anyLabel, searchPlaceholder }: Props) {
  const [query, setQuery] = useState("");

  const filtered = DISTRICTS.filter((d) =>
    d.toLowerCase().includes(query.toLowerCase())
  );

  function handleSelect(district: string | null) {
    onSelect(district);
    setQuery("");
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="pb-2 pt-1">
        <div className="relative mb-2">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl bg-surface py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-muted outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto divide-y divide-line">
          {!query && (
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className="flex w-full items-center gap-3 py-3 px-4"
            >
              <span className="flex-1 text-left text-[15px] text-ink">{anyLabel}</span>
              {selected === null && <Check size={16} className="text-brand shrink-0" />}
            </button>
          )}
          {filtered.map((district) => (
            <button
              key={district}
              type="button"
              onClick={() => handleSelect(district)}
              className="flex w-full items-center gap-3 py-3 px-4"
            >
              <span className="flex-1 text-left text-[15px] text-ink">{district}</span>
              {selected === district && <Check size={16} className="text-brand shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
