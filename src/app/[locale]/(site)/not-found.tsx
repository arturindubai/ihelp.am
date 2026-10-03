import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/** 404 внутри (site): рендерится с шапкой и подвалом сайта благодаря catch-all + (site)/layout.tsx */
export default async function SiteNotFound() {
  const t = await getTranslations("common");
  return (
    <div className="container-m py-20 text-center">
      <h1 className="h1 mb-2">404</h1>
      <p className="mb-6 text-muted">{t("notFound")}</p>
      <Link className="btn-primary" href="/">
        {t("toHome")}
      </Link>
    </div>
  );
}
