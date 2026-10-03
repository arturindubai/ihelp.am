import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { loginMethods } from "@/server/otp";
import { envContacts } from "@/server/contacts";
import { getMastersForService, loadServiceRaw, localizeService, resolveSelection } from "@/server/services/catalog";
import { isFirstOrder, getLastOrderDraft, getOrderDraftById } from "@/server/services/booking";
import { calculatePrice } from "@/lib/pricing";
import { getBookingAddresses } from "@/server/services/pages/catalog";
import { tr } from "@/i18n/locales";
import { Checkout } from "@/components/booking/Checkout";
import { InlineLogin } from "./InlineLogin";
import { PromoSlot } from "@/components/PromoSlot";

export default async function BookPage({ params, searchParams }: { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ o?: string; p?: string; reorder?: string }> }) {
  const { locale, slug } = await params;
  const { o = "", p = null, reorder } = await searchParams;
  setRequestLocale(locale);
  const raw = await loadServiceRaw(slug);
  if (!raw) redirect({ href: "/", locale });
  const s = localizeService(raw!, locale);

  const [user, settings, t, tc] = await Promise.all([getCurrentUser(), getSettings(), getTranslations("booking"), getTranslations("common")]);
  const methods = await loginMethods(settings);

  if (!user) {
    // Незалогиненный пользователь видит форму входа
    const urlOptionIds = o.split(",").filter(Boolean);
    const sel = resolveSelection(s, urlOptionIds, p);
    if (!sel.ok) redirect({ href: `/s/${slug}`, locale });
    return (
      <div className="container-m">
        <div className="flex items-center gap-3 pt-3">
          <Link href={`/s/${slug}`} className="grid size-9 place-items-center rounded-full bg-surface" aria-label={tc("back")}><ArrowLeft size={18} /></Link>
          <h1 className="text-xl font-bold">{t("title")}</h1>
        </div>
        <div className="card mt-4 p-4">
          <h2 className="h3 mb-3">{t("loginToContinue")}</h2>
          <InlineLogin channels={methods.channels} emailEnabled={methods.email} telegramBot={settings.notify.telegramBotUsername || null} />
        </div>
      </div>
    );
  }

  // Загружаем всё необходимое параллельно
  const [addresses, masters, first, lastDraft, reorderDraft] = await Promise.all([
    getBookingAddresses(user.id),
    getMastersForService(raw!.id),
    isFirstOrder(user.id),
    reorder ? Promise.resolve(null) : getLastOrderDraft(user.id),
    reorder ? getOrderDraftById(reorder, user.id) : Promise.resolve(null),
  ]);

  // Предзаполнение для повторного заказа
  let reorderOldPrice: number | null = null;
  let defaultNoCall = false;
  let defaultMasterId: string | null = null;
  let unavailableParams: string[] = [];
  let optionIds = o.split(",").filter(Boolean);
  let planId = p;

  if (reorderDraft) {
    // Услуга снята с продажи — редирект на страницу услуги с флагом
    if (raw!.comingSoon) redirect({ href: `/s/${slug}?unavailable=1`, locale });

    // Фильтруем опции: оставляем только те, что ещё есть в каталоге
    const validOptionIdSet = new Set(s.groups.flatMap((g) => g.options.map((opt) => opt.id)));
    const stillValidIds = reorderDraft.optionIds.filter((id) => validOptionIdSet.has(id));
    const removedIds = new Set(reorderDraft.optionIds.filter((id) => !validOptionIdSet.has(id)));

    // Имена недоступных параметров из сохранённой конфигурации заказа
    if (removedIds.size > 0) {
      unavailableParams = reorderDraft.configOptions
        .filter((co) => removedIds.has(co.optionId))
        .map((co) => (typeof co.optionTitle === "object" && co.optionTitle !== null ? tr(co.optionTitle, locale) : String(co.optionTitle ?? "")))
        .filter(Boolean);
    }

    // Для обязательных групп без выбора добавляем дефолтную опцию группы
    const selectedIds = new Set(stillValidIds);
    const filledIds = [...stillValidIds];
    for (const g of s.groups) {
      if (!g.required) continue;
      if (g.options.some((o) => selectedIds.has(o.id))) continue;
      const defaultOpt = g.options.find((o) => o.isDefault) ?? g.options[0];
      if (defaultOpt) { filledIds.push(defaultOpt.id); selectedIds.add(defaultOpt.id); }
    }
    optionIds = filledIds;
    // Если план из прежнего заказа уже недоступен, берём дефолтный план услуги
    const storedPlanValid = reorderDraft.planId && s.plans.some((p) => p.id === reorderDraft.planId);
    planId = storedPlanValid ? reorderDraft.planId : (s.plans.find((p) => p.isDefault)?.id ?? s.plans[0]?.id ?? null);
    defaultNoCall = reorderDraft.noCall;

    // Предвыбор мастера — только если активен и работает с услугой
    if (reorderDraft.masterId && masters.some((m) => m.id === reorderDraft.masterId)) {
      defaultMasterId = reorderDraft.masterId;
    }

    // Сравнение старой и новой цены по обычному (не первому) визиту
    const reorderSel = resolveSelection(s, filledIds, planId);
    if (reorderSel.ok) {
      const newPrice = calculatePrice({ lines: reorderSel.lines, plan: reorderSel.pricePlan, isFirstOrder: first, rules: settings.pricing });
      if (newPrice.regular.price !== reorderDraft.pricePerVisit) {
        reorderOldPrice = reorderDraft.pricePerVisit;
      }
    }
  }

  const sel = resolveSelection(s, optionIds, planId);
  if (!sel.ok) redirect({ href: `/s/${slug}${reorder ? "?unavailable=1" : ""}`, locale });
  const ok = sel as Extract<typeof sel, { ok: true }>;

  const defaultAddressId = reorderDraft?.addressId ?? lastDraft?.addressId ?? null;
  const defaultPaymentMethod = reorderDraft?.paymentMethod ?? lastDraft?.paymentMethod ?? null;

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
        defaultAddressId={defaultAddressId}
        defaultPaymentMethod={defaultPaymentMethod}
        defaultNoCall={defaultNoCall}
        defaultMasterId={defaultMasterId}
        reorderOldPrice={reorderOldPrice}
        unavailableParams={unavailableParams}
        phoneConfirmed={!!user.phone}
        emailVerified={!!user.emailVerifiedAt}
        channels={methods.channels}
        telegramBot={settings.notify.telegramBotUsername || null}
      />
    </>
  );
}
