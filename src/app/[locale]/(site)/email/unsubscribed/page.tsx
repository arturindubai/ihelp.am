import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { confirmUnsubscribeAction } from "@/server/actions/account";

export default async function UnsubscribedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("notify.client");
  const tc = await getTranslations("common");

  if (token) {
    const action = confirmUnsubscribeAction.bind(null, token, locale);
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold text-ink mb-3">{t("unsubscribeConfirmTitle")}</h1>
        <p className="text-muted max-w-sm mb-6">{t("unsubscribeConfirmBody")}</p>
        <form action={action}>
          <button type="submit" className="btn-dark">
            {t("unsubscribeButton")}
          </button>
        </form>
        <Link href="/" className="mt-4 text-sm text-muted underline underline-offset-2">
          {tc("toHome")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold text-ink mb-3">{t("unsubscribedTitle")}</h1>
      <p className="text-muted max-w-sm">{t("unsubscribedBody")}</p>
    </div>
  );
}
