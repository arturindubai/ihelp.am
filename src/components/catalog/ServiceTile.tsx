"use client";

import { Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Img } from "@/components/Img";
import { cn } from "@/lib/format";

export type ServiceTileItem = {
  slug: string;
  title: string;
  image: string | null;
  href: string;
  comingSoon?: boolean;
};

type Props = {
  item: ServiceTileItem;
  comingSoonLabel?: string;
};

export function ServiceTile({ item, comingSoonLabel = "Скоро" }: Props) {
  return (
    <Link href={item.href as "/"} className="group flex flex-col">
      <div className="relative aspect-square overflow-hidden rounded-2xl">
        {item.comingSoon && (
          <span className="absolute left-1.5 top-1.5 z-10 rounded-full bg-badge px-1.5 py-0.5 text-[10px] font-bold text-on-badge">
            {comingSoonLabel}
          </span>
        )}
        {item.image ? (
          <>
            <Img src={item.image} fill sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 20vw" className="object-cover transition group-hover:opacity-90" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />
            <p className="absolute bottom-0 left-0 right-0 line-clamp-2 px-2 pb-2 pt-1.5 text-[13px] font-medium leading-tight text-inverse">
              {item.title}
            </p>
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-brand-50 transition group-hover:bg-brand-100">
            <Sparkles size={40} className="text-brand" />
          </div>
        )}
      </div>
      {!item.image && (
        <p className="mt-1.5 line-clamp-2 text-center text-[13px] font-medium leading-tight text-ink">
          {item.title}
        </p>
      )}
    </Link>
  );
}

type GroupedProps = {
  groups: { section: string | null; items: ServiceTileItem[] }[];
  comingSoonLabel?: string;
  className?: string;
};

export function ServiceTileGrid({ groups, comingSoonLabel, className }: GroupedProps) {
  const showHeaders = groups.length > 1;
  return (
    <div className={cn("space-y-4", className)}>
      {groups.map((g, gi) => (
        <div key={gi}>
          {showHeaders && g.section && (
            <p className="sticky top-0 z-10 mb-2 bg-paper text-xs font-semibold uppercase tracking-wide text-muted first:mt-0 mt-6">
              {g.section}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {g.items.map((item) => (
              <ServiceTile key={item.slug} item={item} comingSoonLabel={comingSoonLabel} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
