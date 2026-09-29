import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MessageCircle, CalendarClock } from "lucide-react";
import { getCategory, getCategories } from "@/server/services/catalog";
import { getSettings } from "@/server/settings";
import { contactLink } from "@/lib/contacts";
import { ServiceCard } from "@/components/ServiceCard";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/format";
import { PromoSlot } from "@/components/PromoSlot";

export default async function CategoryPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [c, cats, s, t] = await Promise.all([getCategory(slug, locale), getCategories(locale), getSettings(), getTranslations("catalog")]);
  if (!c) notFound();

  const wa = contactLink(s.brand, "whatsapp");

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

      {c.comingSoon ? (
        <div className="mt-16 flex flex-col items-center gap-4 pb-16 text-center">
          <CalendarClock size={64} className="text-brand opacity-40" />
          <h2 className="text-xl font-semibold">{t("comingSoonTitle")}</h2>
          <p className="max-w-xs text-sm text-muted">{t("comingSoonText")}</p>
          {wa && (
            <a href={wa.href} target="_blank" rel="noopener noreferrer" className="btn-primary mt-2 inline-flex items-center gap-2">
              <MessageCircle size={18} />
              {t("writeWhatsApp")}
            </a>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <PromoSlot placement="CATALOG" locale={locale} />
          <div className="mt-4 space-y-3">
            {c.services.map((svc) => (
              <ServiceCard key={svc.slug} s={svc} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
