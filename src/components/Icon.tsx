import { Bath, BedDouble, Brush, CalendarCheck, Check, CookingPot, Fence, Layers, PauseCircle, Shirt, Sparkles, Star, UserCheck, Wallet, Wind, ShieldCheck, Clock, Headphones, type LucideProps } from "lucide-react";

const MAP = {
  kitchen: CookingPot,
  bath: Bath,
  floor: Brush,
  bed: BedDouble,
  tidy: Layers,
  balcony: Fence,
  dust: Wind,
  laundry: Shirt,
  extra: Sparkles,
  user: UserCheck,
  calendar: CalendarCheck,
  pause: PauseCircle,
  cash: Wallet,
  star: Star,
  shield: ShieldCheck,
  clock: Clock,
  support: Headphones,
  check: Check,
};
export const ICON_NAMES = Object.keys(MAP);

export function Icon({ name, ...p }: { name: string } & LucideProps) {
  const C = MAP[name as keyof typeof MAP] || Check;
  return <C {...p} />;
}
