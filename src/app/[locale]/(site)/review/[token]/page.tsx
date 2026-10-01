import { getTranslations, setRequestLocale } from "next-intl/server";
import { getReviewToken } from "@/server/services/pages/catalog";
import { tr } from "@/i18n/locales";
import { dateLabel } from "@/lib/format";
import { Logo } from "@/components/Logo";
import { ReviewForm } from "./ReviewForm";

export default async function ReviewTokenPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("review");

  const rt = await getReviewToken(token);

  const isInvalid = !rt || !!rt.usedAt || rt.expiresAt < new Date() || rt.visit.status !== "DONE";
  const alreadyLeft = !!rt?.visit.review;

  if (isInvalid || alreadyLeft) {
    return (
      <div className="container-m flex min-h-[50dvh] flex-col items-center justify-center gap-4 pt-8 text-center">
        <div className="rounded-xl bg-bad-50 p-4 text-bad">
          {t("invalidToken")}
        </div>
      </div>
    );
  }

  const master = rt.visit.master;
  const masterName = master ? tr(master.name, locale) : t("masterLabel");
  const masterPhoto = master?.photo ?? null;
  const service = rt.visit.order.service;
  const serviceTitle = tr(service.title, locale);
  const serviceSlug = service.slug;
  const visitDateLabel = rt.visit.scheduledAt
    ? dateLabel(rt.visit.scheduledAt, locale, { day: "numeric", month: "long" })
    : "";

  return (
    <div className="container-m max-w-md mx-auto pt-8 pb-10">
      <div className="flex justify-center pb-6">
        <Logo className="text-2xl" />
      </div>
      <ReviewForm
        token={token}
        masterName={masterName}
        masterPhoto={masterPhoto}
        serviceTitle={serviceTitle}
        visitDateLabel={visitDateLabel}
        serviceSlug={serviceSlug}
      />
    </div>
  );
}
