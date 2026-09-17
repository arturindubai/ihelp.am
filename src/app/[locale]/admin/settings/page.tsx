import { getTranslations } from "next-intl/server";
import { pageUser } from "@/server/adminPage";
import { getSettings, mask, CARD_PAYMENTS_INTEGRATED } from "@/server/settings";
import { lockedContacts } from "@/server/contacts";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { SettingsEditor } from "@/components/admin/SettingsEditor";

export default async function AdminSettings() {
  if (!(await pageUser("settings"))) return <Forbidden />;
  const t = await getTranslations("admin");
  const s = structuredClone(await getSettings());
  s.otp.sms.authToken = mask(s.otp.sms.authToken);
  s.otp.whatsapp.accessToken = mask(s.otp.whatsapp.accessToken);
  s.otp.telegram.gatewayToken = mask(s.otp.telegram.gatewayToken);
  s.notify.telegramBotToken = mask(s.notify.telegramBotToken);
  return (
    <div className="max-w-3xl">
      <PageHead title={t("settings.title")} />
      <SettingsEditor initial={s} devMode={process.env.OTP_DEV_MODE === "true"} lockedContacts={lockedContacts()} cardIntegrated={CARD_PAYMENTS_INTEGRATED} />
    </div>
  );
}
