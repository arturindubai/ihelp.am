import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { db } from "@/server/db";
import { tr } from "@/i18n/locales";

export default async function StaticPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const p = await db.page.findFirst({ where: { slug, active: true } });
  if (!p) notFound();
  return (
    <div className="container-m pt-6">
      <h1 className="h1 mb-4">{tr(p.title, locale)}</h1>
      <div className="whitespace-pre-line text-[15px] leading-relaxed">{tr(p.body, locale)}</div>
    </div>
  );
}
