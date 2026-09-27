import { cn } from "@/lib/format";

/** Логотип iHelp: текстовый вариант А, утверждён 27.09.2026 (design-content-6). Иконки приложения — public/img/icon.svg, src/app/icon.svg */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline font-bold leading-none tracking-tight text-brand", className)}>
      iHelp
    </span>
  );
}
