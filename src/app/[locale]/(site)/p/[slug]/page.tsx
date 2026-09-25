import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { tr } from "@/i18n/locales";
import { fillContacts } from "@/lib/contacts";
import { Markdown } from "@/components/ui/Markdown";

export default async function StaticPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const [p, s] = await Promise.all([db.page.findFirst({ where: { slug, active: true } }), getSettings()]);
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
