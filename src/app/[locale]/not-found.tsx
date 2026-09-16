import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <div className="container-m py-20 text-center">
      <h1 className="h1">{t("notFound")}</h1>
      <Link href="/" className="btn-primary mt-6">{t("toHome")}</Link>
    </div>
  );
}
