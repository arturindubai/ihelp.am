import { getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { pageUser } from "@/server/adminPage";
import { dateLabel } from "@/lib/format";
import { hm } from "@/lib/time";
import { PageHead, Forbidden, Table } from "@/components/admin/ui";

export default async function AdminLog({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await pageUser("log"))) return <Forbidden />;
  const t = await getTranslations("admin");
  const logs = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { user: true } });
  return (
    <div className="max-w-5xl">
      <PageHead title={t("log.title")} />
      <Table head={[t("log.when"), t("log.who"), t("log.action"), t("log.entity")]} empty={!logs.length}>
        {logs.map((l) => (
          <tr key={l.id}>
            <td className="px-3 py-2 text-xs whitespace-nowrap text-muted">{dateLabel(l.createdAt, locale, { day: "numeric", month: "short" })} {hm(l.createdAt)}</td>
            <td className="px-3 py-2">{l.user?.name || l.user?.phone || "—"}</td>
            <td className="px-3 py-2 font-mono text-xs">{l.action}</td>
            <td className="max-w-md truncate px-3 py-2 font-mono text-xs text-muted">{l.entity}{l.entityId ? `:${l.entityId.slice(-6)}` : ""} {l.data ? JSON.stringify(l.data).slice(0, 120) : ""}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
