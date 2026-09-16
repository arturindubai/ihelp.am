"use client";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { localeLabels, type Locale } from "@/i18n/locales";
import { useSearchParams } from "next/navigation";

export function LocaleSwitcher({ enabled }: { enabled: string[] }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  if (enabled.length < 2) return null;
  return (
    <div className="flex rounded-full bg-surface p-0.5 text-xs font-semibold">
      {enabled.map((l) => (
        <button
          key={l}
          onClick={() => router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { locale: l as Locale })}
          className={`rounded-full px-2.5 py-1.5 ${l === locale ? "bg-white shadow-sm" : "text-muted"}`}
        >
          {localeLabels[l as Locale]}
        </button>
      ))}
    </div>
  );
}
