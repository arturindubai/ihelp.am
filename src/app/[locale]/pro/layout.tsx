import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSettings } from "@/server/settings";
import { Logo } from "@/components/Logo";

export default async function ProLayout({ children }: { children: React.ReactNode }) {
  const [s, t] = await Promise.all([getSettings(), getTranslations("pro")]);
  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-30 border-b border-line bg-paper">
        <div className="container-m flex h-14 items-center gap-2">
          <Link href="/" className="flex items-center gap-2 font-bold"><Logo className="size-7" />{s.brand.name}</Link>
          <span className="ml-auto text-sm font-medium text-muted">{t("title")}</span>
        </div>
      </header>
      {children}
    </div>
  );
}
