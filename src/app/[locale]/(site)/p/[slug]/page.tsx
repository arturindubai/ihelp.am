import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { tr } from "@/i18n/locales";
import { fillContacts } from "@/lib/contacts";

export default async function StaticPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const [p, s] = await Promise.all([db.page.findFirst({ where: { slug, active: true } }), getSettings()]);
  if (!p) notFound();
  return (
    <div className="container-m pt-6">
      <h1 className="h1 mb-4">{tr(p.title, locale)}</h1>
      {/* В тексте можно писать {{phone}}, {{email}} и т.д. — подставятся контакты из .env */}
      <div className="whitespace-pre-line text-[15px] leading-relaxed">{fillContacts(tr(p.body, locale), s.brand)}</div>
    </div>
  );
}
