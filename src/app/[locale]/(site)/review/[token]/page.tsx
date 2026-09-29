import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/server/db";
import { ReviewForm } from "./ReviewForm";

export default async function ReviewTokenPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("review");

  const rt = await db.reviewToken.findUnique({
    where: { token },
    select: {
      usedAt: true,
      expiresAt: true,
      visit: {
        select: {
          id: true,
          status: true,
          review: { select: { id: true } },
          master: { select: { name: true } },
        },
      },
    },
  });

  const isInvalid = !rt || !!rt.usedAt || rt.expiresAt < new Date() || rt.visit.status !== "DONE";
  const alreadyLeft = !!rt?.visit.review;

  if (isInvalid || alreadyLeft) {
    return (
      <div className="container-m flex min-h-[50dvh] flex-col items-center justify-center gap-4 pt-8 text-center">
        <p className="text-lg text-muted">{alreadyLeft ? t("alreadyLeft") : t("invalid")}</p>
      </div>
    );
  }

  return (
    <div className="container-m py-8">
      <h1 className="mb-6 text-center text-xl font-bold">{t("title")}</h1>
      <ReviewForm token={token} />
    </div>
  );
}
