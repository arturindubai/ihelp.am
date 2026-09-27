import { getTranslations, setRequestLocale } from "next-intl/server";
import { getHome } from "@/server/services/catalog";
import { ServiceCard } from "@/components/ServiceCard";
import { Link } from "@/i18n/navigation";

export default async function Services({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [data, t] = await Promise.all([getHome(locale), getTranslations("nav")]);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pt-4">
      <h1 className="h1">{t("services")}</h1>

      <div className="mt-3 flex flex-wrap gap-2">
        {data.categories.map((c) => (
          <Link
            key={c.slug}
            href={c.comingSoon ? `/c/${c.slug}` : (c.href || `/c/${c.slug}`)}
            className="inline-flex items-center rounded-full border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink transition hover:border-brand hover:bg-brand-50 hover:text-brand-text"
          >
            {c.title}
          </Link>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {data.services.map((s) => (
          <ServiceCard key={s.slug} s={s} />
        ))}
      </div>
    </div>
  );
}
