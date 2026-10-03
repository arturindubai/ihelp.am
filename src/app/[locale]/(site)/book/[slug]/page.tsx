import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { loginMethods } from "@/server/otp";
import { envContacts } from "@/server/contacts";
import { getMastersForService, loadServiceRaw, localizeService, resolveSelection } from "@/server/services/catalog";
import { isFirstOrder, getLastOrderDraft } from "@/server/services/booking";
import { getBookingAddresses } from "@/server/services/pages/catalog";
import { tr } from "@/i18n/locales";
import { amd } from "@/lib/format";
import { Checkout } from "@/components/booking/Checkout";
import { InlineLogin } from "./InlineLogin";
import { PromoSlot } from "@/components/PromoSlot";

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
  const [user, settings, t, tc] = await Promise.all([getCurrentUser(), getSettings(), getTranslations("booking"), getTranslations("common")]);
  const methods = await loginMethods(settings);

  if (!user) {
    const guestGoogleUrl = settings.google.enabled && settings.google.clientId
      ? `/api/auth/google/start?next=${encodeURIComponent(`/book/${slug}${o ? `?o=${o}` : ""}${p ? `${o ? "&" : "?"}p=${p}` : ""}`)}`
      : undefined;
    const total = ok.lines.reduce((sum, l) => sum + l.price, 0);
    return (
      <div className="container-m">
        <div className="flex items-center gap-3 pt-3">
          <Link href={`/s/${slug}`} className="grid size-9 place-items-center rounded-full bg-surface" aria-label={tc("back")}><ArrowLeft size={18} /></Link>
          <h1 className="text-xl font-bold">{t("title")}</h1>
        </div>
        <div className="card mt-4 p-4">
          <div className="mb-4 border-b border-line pb-4">
            <p className="font-semibold">{s.title}</p>
            <dl className="mt-2 space-y-1 text-sm">
              {ok.lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-4">
                  <dt className="text-ink">{l.optionTitle}</dt>
                  <dd className="shrink-0 text-muted">{amd(l.price)}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 flex justify-between text-sm font-semibold">
              <span>{t("payNow")}</span>
              <span>{amd(total)}</span>
            </div>
            {settings.booking.freeCancelHours > 0 && (
              <p className="mt-2 text-xs text-ok">{t("freeCancel", { hours: settings.booking.freeCancelHours })}</p>
            )}
          </div>
          <h2 className="h3 mb-3">{t("loginOrderSaved")}</h2>
          <InlineLogin channels={methods.channels} emailEnabled={methods.email} telegramBot={settings.notify.telegramBotUsername || null} googleUrl={guestGoogleUrl} />
        </div>
      </div>
    );
  }

  const [addresses, masters, first, draft] = await Promise.all([
    getBookingAddresses(user.id),
    getMastersForService(raw!.id),
    isFirstOrder(user.id),
    getLastOrderDraft(user.id),
  ]);

  return (
    <>
      <PromoSlot placement="CHECKOUT" locale={locale} />
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
      masters={masters.map((m) => ({ id: m.id, name: tr(m.name, locale), photo: m.photo, rating: m.rating, reviewsCount: m.reviewsCount, experienceYears: m.experienceYears, languages: m.languages }))}
      allowChooseMaster={settings.booking.allowChooseMaster}
      horizonDays={settings.booking.horizonDays}
      cashEnabled={settings.payments.cashEnabled}
      cardEnabled={settings.payments.cardEnabled}
      freeCancelHours={settings.booking.freeCancelHours}
      lateCancelFeeAmd={settings.booking.lateCancelFeeAmd}
      contacts={envContacts()}
      defaultAddressId={draft?.addressId ?? null}
      defaultPaymentMethod={draft?.paymentMethod ?? null}
      phoneConfirmed={!!user.phone}
      emailVerified={!!user.emailVerifiedAt}
      channels={methods.channels}
      telegramBot={settings.notify.telegramBotUsername || null}
    />
    </>
  );
}
