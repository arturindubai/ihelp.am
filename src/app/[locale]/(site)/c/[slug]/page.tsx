import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarClock } from "lucide-react";
import { getCategory, getCategories } from "@/server/services/catalog";
import { getSettings } from "@/server/settings";
import { FormatCards } from "@/components/FormatCards";
import { Link } from "@/i18n/navigation";
import { NotifyForm } from "@/components/catalog/NotifyForm";
import { ServiceTileGrid } from "@/components/catalog/ServiceTile";
import { cn } from "@/lib/format";
import { PromoSlot } from "@/components/PromoSlot";
import { buildAlternates } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const [c, s, t] = await Promise.all([getCategory(slug, locale), getSettings(), getTranslations("seo")]);
  if (!c) return {};
  if (c.comingSoon) return { robots: { index: false, follow: false } };
  const rawDesc = c.description || "";
  const fallback = t("categoryFallbackDesc");
  const description = rawDesc.length >= 100 ? rawDesc : rawDesc ? `${rawDesc} ${fallback}` : `${c.title}. ${fallback}`;
  return {
    title: c.title,
    description,
    alternates: buildAlternates(`/c/${slug}`, locale, s.locales.indexable),
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const [c, cats, t, tc] = await Promise.all([getCategory(slug, locale), getCategories(locale), getTranslations("catalog"), getTranslations("common")]);
  if (!c) notFound();

  const notifyStrings = {
    notifyTitle: t("notifyTitle"),
    notifySubtitle: t("notifySubtitle"),
    notifyPlaceholder: t("notifyPlaceholder"),
    notifyHint: t("notifyHint"),
    notifyButton: t("notifyButton"),
    notifySuccess: t("notifySuccess"),
    notifyAlready: t("notifyAlready"),
    notifyInvalid: t("notifyInvalid"),
    notifyTooMany: t("notifyTooMany"),
  };

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pt-4">
      <h1 className="h1">{c.title}</h1>
      {c.description && <p className="mt-1 text-sm text-muted">{c.description}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {cats.map((cat) => (
          <Link
            key={cat.slug}
            href={cat.href}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition",
              cat.slug === slug
                ? "border-brand bg-brand-50 text-brand-text"
                : "border-line bg-paper text-ink hover:border-brand hover:bg-brand-50 hover:text-brand-text",
            )}
          >
            {cat.title}
          </Link>
        ))}
      </div>

      <FormatCards showFormats={c.showFormats} formats={c.formats} />

      {c.comingSoon ? (
        <div className="mt-10 pb-16">
          <div className="md:grid md:grid-cols-2 md:items-start md:gap-8">
            <div className="flex flex-col items-center gap-4 text-center md:items-start md:text-left">
              <CalendarClock size={64} className="opacity-35 text-brand" />
              <h2 className="text-xl font-semibold">{t("comingSoonTitle")}</h2>
              <p className="text-sm text-muted">{t("comingSoonText")}</p>
            </div>
            <div className="md:mt-0">
              <NotifyForm serviceSlug={c.slug} t={notifyStrings} />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <PromoSlot placement="CATALOG" locale={locale} />
          <div className="mt-4">
            <ServiceTileGrid
              groups={c.serviceGroups.map((g) => ({
                section: g.section,
                items: g.items.map((s) => ({
                  slug: s.slug,
                  title: s.title as string,
                  image: s.image,
                  href: `/s/${s.slug}`,
                  comingSoon: s.comingSoon,
                })),
              }))}
              comingSoonLabel={tc("comingSoon")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
