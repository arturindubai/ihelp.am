import { cn } from "@/lib/format";

/** Логотип: смена файла или разметки — только здесь (+ src/app/icon.svg для вкладки браузера и manifest) */
export const LOGO_SRC = "/img/icon.svg";

export function Logo({ className }: { className?: string }) {
  return <img src={LOGO_SRC} alt="" className={cn("size-8 rounded-lg", className)} />;
}
