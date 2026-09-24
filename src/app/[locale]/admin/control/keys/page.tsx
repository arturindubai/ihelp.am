import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageUser } from "@/server/adminPage";
import { keysOverview } from "@/server/services/keys";
import { teamBotStatus } from "@/server/services/teamBot";
import { Forbidden } from "@/components/admin/ui";
import { CcHeader } from "@/components/admin/cc/CcHeader";
import { KeysPanel } from "@/components/admin/cc/KeysPanel";
import { dateLabel, timeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Ключи сервисов — как Secrets в админке LIA: вставить, заменить, проверить. Значения никогда не показываются */
export default async function KeysPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await pageUser("control"))) return <Forbidden />;
  const [t, rows, team] = await Promise.all([getTranslations("admin.cc.keys"), keysOverview(), teamBotStatus()]);
  const when = (d: Date) => `${dateLabel(d, locale, { day: "numeric", month: "short", year: "numeric" })}, ${timeLabel(d)}`;
  return (
    <div className="max-w-4xl">
      <CcHeader page="keys" locale={locale} />
      <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>
      <KeysPanel
        rows={rows.map(({ changedAt, ...r }) => ({ ...r, changedLabel: changedAt ? when(changedAt) : null }))}
        team={{ ...team, members: team.members.map((m) => ({ telegramId: m.telegramId, name: m.name, addedLabel: when(new Date(m.addedAt)) })) }}
      />
    </div>
  );
}
