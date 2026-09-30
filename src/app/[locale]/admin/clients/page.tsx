import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageUser } from "@/server/adminPage";
import { amd, dateLabel } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { getAdminClients, ADMIN_CLIENTS_PER } from "@/server/services/pages/admin";
import { PageHead, Forbidden, Table } from "@/components/admin/ui";

export default async function AdminClients({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const { locale } = await params;
  const sp = await searchParams;
  if (!(await pageUser("clients"))) return <Forbidden />;
  const t = await getTranslations("admin");
  const page = Math.max(1, Number(sp.page) || 1);
  const { users, count, byUser } = await getAdminClients(sp.q, page);
  const PER = ADMIN_CLIENTS_PER;
  return (
    <div>
      <PageHead title={t("clients.title")} sub={count} />
      <form className="mb-3 flex gap-2"><input name="q" defaultValue={sp.q} placeholder={t("clients.searchPh")} className="input max-w-sm" /><button className="btn-dark">{t("common.search")}</button></form>
      <Table head={[t("clients.name"), t("clients.phone"), t("clients.role"), t("clients.orders"), t("clients.spent"), t("clients.lastOrder"), t("clients.registered")]} empty={!users.length}>
        {users.map((u) => (
          <tr key={u.id} className="hover:bg-surface/50">
            <td className="px-3 py-2.5"><Link href={`/admin/clients/${u.id}`} className="font-medium hover:underline">{u.name || "—"}</Link>{u.blocked && <span className="chip ml-1 bg-bad-50 text-bad">{t("clients.blocked")}</span>}</td>
            <td className="px-3 py-2.5 whitespace-nowrap">{formatPhone(u.phone)}</td>
            <td className="px-3 py-2.5 text-xs">{t(`staff.roles.${u.role}`)}</td>
            <td className="px-3 py-2.5">{u._count.orders}</td>
            <td className="px-3 py-2.5 whitespace-nowrap">{amd(byUser.get(u.id) || 0)}</td>
            <td className="px-3 py-2.5 text-xs text-muted">{u.orders[0] ? dateLabel(u.orders[0].createdAt, locale, { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
            <td className="px-3 py-2.5 text-xs text-muted">{dateLabel(u.createdAt, locale, { day: "numeric", month: "short", year: "numeric" })}</td>
          </tr>
        ))}
      </Table>
      {count > PER && <div className="mt-3 flex justify-center gap-2 text-sm">{page > 1 && <Link className="btn-outline btn-sm" href={`/admin/clients?page=${page - 1}&q=${sp.q || ""}`}>{t("common.prev")}</Link>}{page * PER < count && <Link className="btn-outline btn-sm" href={`/admin/clients?page=${page + 1}&q=${sp.q || ""}`}>{t("common.next")}</Link>}</div>}
    </div>
  );
}
