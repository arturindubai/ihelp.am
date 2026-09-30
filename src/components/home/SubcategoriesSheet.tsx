"use client";

import { ChevronRight, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Img } from "@/components/Img";
import { Sheet } from "@/components/ui/Sheet";

type SubcategoryItem = {
  slug: string;
  title: string;
  subtitle: string | null;
  image: string | null;
  href: string;
};

type SubcategoryGroup = {
  section: string | null;
  items: SubcategoryItem[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  groups: SubcategoryGroup[];
};

export function SubcategoriesSheet({ open, onClose, title, groups }: Props) {
  const showSectionHeaders = groups.length > 1;

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {groups.map((g, gi) => (
        <div key={gi}>
          {showSectionHeaders && g.section && (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1 mt-4 first:mt-0">
              {g.section}
            </p>
          )}
          {g.items.map((item) => (
            <Link
              key={item.slug}
              href={item.href as "/"}
              onClick={onClose}
              className="flex items-center gap-3 py-3 border-b border-line last:border-0 hover:bg-surface -mx-1 px-1 rounded-xl"
            >
              <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-surface flex items-center justify-center">
                {item.image ? (
                  <Img src={item.image} width={48} height={48} className="object-cover w-full h-full" />
                ) : (
                  <Sparkles size={20} className="text-muted" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-ink line-clamp-2">{item.title}</div>
                {item.subtitle && (
                  <div className="text-sm text-muted line-clamp-1">{item.subtitle}</div>
                )}
              </div>
              <ChevronRight size={16} className="text-muted shrink-0" />
            </Link>
          ))}
        </div>
      ))}
    </Sheet>
  );
}
