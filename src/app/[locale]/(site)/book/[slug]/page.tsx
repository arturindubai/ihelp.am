import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { loginMethods } from "@/server/otp";
import { getMastersForService, loadServiceRaw, localizeService, resolveSelection } from "@/server/services/catalog";
import { isFirstOrder } from "@/server/services/booking";
import { tr } from "@/i18n/locales";
import { Checkout } from "@/components/booking/Checkout";
import { InlineLogin } from "./InlineLogin";

export default async function BookPage({ params, searchParams }: { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ o?: string; p?: string }> }) {
  const { locale, slug } = await params;
  const { o = "", p = null } = await searchParams;
  setRequestLocale(locale);
  const raw = await loadServiceRaw(slug);
  if (!raw) redirect({ href: "/", locale });
  const s = localizeService(raw!, locale);
  const optionIds = o.split(",").filter(Boolean);
  const sel = resolveSelection(s, optionIds, p);
  if (!sel.ok) redirect({ href: `/s/${slug}`, locale });
  const ok = sel as Extract<typeof sel, { ok: true }>;
  const [user, settings, t] = await Promise.all([getCurrentUser(), getSettings(), getTranslations("booking")]);

  const header = (
    <div className="flex items-center gap-3 pt-3">
      <Link href={`/s/${slug}`} className="grid size-9 place-items-center rounded-full bg-surface" aria-label="back"><ArrowLeft size={18} /></Link>
      <h1 className="text-xl font-bold">{t("title")}</h1>
    </div>
  );

  if (!user) {
    const methods = await loginMethods(settings);
    return (
      <div className="container-m">
        {header}
        <div className="card mt-4 p-4">
          <h2 className="h3 mb-3">{t("loginToContinue")}</h2>
          <InlineLogin channels={methods.channels} emailEnabled={methods.email} />
        </div>
      </div>
    );
  }

  const [addresses, masters, first] = await Promise.all([
    db.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] }),
    getMastersForService(raw!.id),
    isFirstOrder(user.id),
  ]);

  return (
    <div className="container-m">
      {header}
      <Checkout
        service={{ id: s.id, slug: s.slug, title: s.title }}
        lines={ok.lines.map(({ groupTitle, optionTitle, price, discountable, durationMin }) => ({ groupTitle, optionTitle, price, discountable, durationMin }))}
        optionIds={optionIds}
        plan={ok.plan ? { id: ok.plan.id, kind: ok.plan.kind, title: ok.plan.title, discountPercent: ok.plan.discountPercent, packageVisits: ok.plan.packageVisits, visitsPerWeek: ok.plan.visitsPerWeek } : null}
        durationMin={ok.durationMin}
        rules={settings.pricing}
        isFirstOrder={first}
        addresses={addresses}
        districts={settings.booking.districts}
        masters={masters.map((m) => ({ id: m.id, name: tr(m.name, locale), photo: m.photo, rating: m.rating, reviewsCount: m.reviewsCount, experienceYears: m.experienceYears }))}
        allowChooseMaster={settings.booking.allowChooseMaster}
        horizonDays={settings.booking.horizonDays}
        cashEnabled={settings.payments.cashEnabled}
        cardEnabled={settings.payments.cardEnabled}
      />
    </div>
  );
}
