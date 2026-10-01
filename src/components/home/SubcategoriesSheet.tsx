"use client";

import { Sheet } from "@/components/ui/Sheet";
import { ServiceTileGrid, type ServiceTileItem } from "@/components/catalog/ServiceTile";

type SubcategoryGroup = {
  section: string | null;
  items: ServiceTileItem[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  groups: SubcategoryGroup[];
  comingSoonLabel?: string;
};

export function SubcategoriesSheet({ open, onClose, title, groups, comingSoonLabel }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="max-h-[80vh] overflow-y-auto pb-4">
        <ServiceTileGrid groups={groups} comingSoonLabel={comingSoonLabel} />
      </div>
    </Sheet>
  );
}
