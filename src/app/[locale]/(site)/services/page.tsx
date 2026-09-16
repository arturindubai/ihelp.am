import { getTranslations, setRequestLocale } from "next-intl/server";
import { getHome } from "@/server/services/catalog";
import { ServiceCard } from "@/components/ServiceCard";

export default async function Services({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [data, t, tc] = await Promise.all([getHome(locale), getTranslations("nav"), getTranslations("common")]);
  return (
    <div className="container-m pt-4">
      <h1 className="h1">{t("services")}</h1>
      <div className="divide-y divide-line">
        {data.services.map((s) => (
          <ServiceCard key={s.slug} s={s} />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {data.categories.filter((c) => c.comingSoon).map((c) => (
          <span key={c.slug} className="chip py-1.5">
            {c.title} · {tc("comingSoon")}
          </span>
        ))}
      </div>
    </div>
  );
}
