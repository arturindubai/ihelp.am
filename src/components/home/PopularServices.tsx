import { getTranslations } from "next-intl/server";
import { ServiceCard } from "@/components/ServiceCard";

type Service = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  image: string | null;
  rating: number;
  reviewsCount: number;
  fromPrice: number;
  maxDiscount: number;
  minDuration: number;
  isNew?: boolean;
  arrivalHours?: number | null;
};

export async function PopularServices({ services }: { services: Service[] }) {
  if (!services.length) return null;
  const t = await getTranslations("home");
  return (
    <section className="mt-8">
      <h2 className="h2">{t("popular")}</h2>
      <div className="divide-y divide-line">
        {services.map((sv) => (
          <ServiceCard key={sv.slug} s={sv} showInlinePrice />
        ))}
      </div>
    </section>
  );
}
