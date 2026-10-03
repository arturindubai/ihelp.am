import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getStaticPage } from "@/server/services/pages/catalog";
import { getSettings } from "@/server/settings";
import { tr } from "@/i18n/locales";
import { fillContacts } from "@/lib/contacts";
import { Markdown } from "@/components/ui/Markdown";
import { buildAlternates } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const [p, s, t] = await Promise.all([getStaticPage(slug), getSettings(), getTranslations("seo")]);
  if (!p) return {};
  const title = tr(p.title, locale);
  const rawBody = tr(p.body, locale);
  const rawDesc = rawBody ? rawBody.replace(/[#*_`[\]]/g, "").trim().slice(0, 200) : "";
  const fallback = t("pageFallbackDesc");
  const description = rawDesc.length >= 100 ? rawDesc : rawDesc ? `${rawDesc} ${fallback}` : fallback;
  return {
    title,
    description,
    alternates: buildAlternates(`/p/${slug}`, locale, s.locales.indexable),
  };
}

export default async function StaticPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const [p, s] = await Promise.all([getStaticPage(slug), getSettings()]);
  if (!p) notFound();
  // В тексте можно писать {{phone}}, {{email}} и т.д. — подставятся контакты из .env
  const body = fillContacts(tr(p.body, locale), s.brand);
  return (
    <div className="container-m pt-6">
      <h1 className="h1 mb-4">{tr(p.title, locale)}</h1>
      <Markdown text={body} className="text-[15px] leading-relaxed" />
    </div>
  );
}
