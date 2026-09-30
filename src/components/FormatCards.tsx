import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChevronRight } from "lucide-react";

type FormatEntry = { kind: string; serviceSlug: string };

type Props = {
  showFormats: boolean;
  formats: FormatEntry[];
};

const ICONS: Record<string, string> = {
  ONE_TIME: "✨",
  SUBSCRIPTION: "🔄",
  PACKAGE: "📦",
};

function formatLink(kind: string, serviceSlug: string): string {
  if (kind === "ONE_TIME") return `/s/${serviceSlug}`;
  if (kind === "SUBSCRIPTION") return "/subscriptions";
  return "/packages";
}

export function FormatCards({ showFormats, formats }: Props) {
  const t = useTranslations("catalog");

  if (!showFormats || formats.length < 2) return null;

  const ORDER = ["ONE_TIME", "SUBSCRIPTION", "PACKAGE"];
  const sorted = [...formats].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));

  return (
    <div className="mt-4">
      <h2 className="text-base font-bold text-ink mb-3">{t("formatsTitle")}</h2>
      <div className="grid grid-cols-1 gap-[10px] md:grid-cols-3 md:gap-3">
        {sorted.map((f) => {
          const isRegular = f.kind === "SUBSCRIPTION";
          const key = f.kind === "ONE_TIME" ? "formatOnce" : f.kind === "SUBSCRIPTION" ? "formatRegular" : "formatPack";
          return (
            <Link
              key={f.kind}
              href={formatLink(f.kind, f.serviceSlug)}
              className="card p-4 flex flex-row items-start gap-3 transition hover:bg-surface md:flex-col md:gap-[10px]"
            >
              <div className="size-11 rounded-xl bg-brand-50 flex items-center justify-center text-[22px] shrink-0">
                {ICONS[f.kind]}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-semibold text-ink">{t(`${key}.title`)}</span>
                  {isRegular && (
                    <span className="chip bg-ok-50 text-ok">{t("formatRegular.badge")}</span>
                  )}
                </div>
                <p className="mt-1 text-[13px] text-muted">{t(`${key}.desc`)}</p>
                <span className="mt-2 text-[13px] font-semibold text-brand-text flex items-center gap-1">
                  {t(`${key}.cta`)} <ChevronRight size={14} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
