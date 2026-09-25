import { getTranslations } from "next-intl/server";
import { pageUser } from "@/server/adminPage";
import { getSettings, maskedSettings, CARD_PAYMENTS_INTEGRATED } from "@/server/settings";
import { lockedContacts } from "@/server/contacts";
import { googleRedirectUri, appleRedirectUri } from "@/server/services/oauth";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { SettingsEditor } from "@/components/admin/SettingsEditor";

export default async function AdminSettings() {
  if (!(await pageUser("settings"))) return <Forbidden />;
  const t = await getTranslations("admin");
  // Все ключи из реестра маскируются разом — и токен бота команды, которого в этом редакторе нет
  const s = maskedSettings(await getSettings());
  return (
    <div className="max-w-3xl">
      <PageHead title={t("settings.title")} />
      <SettingsEditor initial={s} devMode={process.env.OTP_DEV_MODE === "true"} lockedContacts={lockedContacts()} cardIntegrated={CARD_PAYMENTS_INTEGRATED} googleRedirect={googleRedirectUri()} appleRedirect={appleRedirectUri()} />
    </div>
  );
}
