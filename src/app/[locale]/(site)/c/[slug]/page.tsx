import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getCategory } from "@/server/services/catalog";
import { ServiceCard } from "@/components/ServiceCard";

export default async function CategoryPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const c = await getCategory(slug, locale);
  if (!c) notFound();
  return (
    <div className="container-m pt-4">
      <h1 className="h1">{c.title}</h1>
      {c.description && <p className="mt-1 text-muted">{c.description}</p>}
      <div className="divide-y divide-line">
        {c.services.map((s) => (
          <ServiceCard key={s.slug} s={s} />
        ))}
      </div>
    </div>
  );
}
