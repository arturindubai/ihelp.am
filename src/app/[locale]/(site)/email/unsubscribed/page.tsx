import { getTranslations } from "next-intl/server";

export default async function UnsubscribedPage() {
  const t = await getTranslations("notify.client");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold text-ink mb-3">{t("unsubscribedTitle")}</h1>
      <p className="text-ink-muted max-w-sm">{t("unsubscribedBody")}</p>
    </div>
  );
}
