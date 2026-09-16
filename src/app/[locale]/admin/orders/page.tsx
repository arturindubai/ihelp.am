import { getTranslations } from "next-intl/server";
import type { Prisma } from "@prisma/client";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db";
import { pageUser } from "@/server/adminPage";
import { tr } from "@/i18n/locales";
import { amd, dateLabel } from "@/lib/format";
import { hm } from "@/lib/time";
import { formatPhone } from "@/lib/phone";
import { PageHead, Forbidden, Table } from "@/components/admin/ui";
import { StatusBadge } from "@/components/account/StatusBadge";

const PER = 30;

export default async function AdminOrders({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string; status?: string; kind?: string; page?: string }> }) {
  const { locale } = await params;
  const sp = await searchParams;
  if (!(await pageUser("orders"))) return <Forbidden />;
  const [t, to, ts] = await Promise.all([getTranslations("admin"), getTranslations("order"), getTranslations("service")]);
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.OrderWhereInput = {};
  if (sp.status) where.status = sp.status as "ACTIVE";
  if (sp.kind) where.kind = sp.kind as "ONE_TIME";
  if (sp.q) {
    const q = sp.q.trim();
    const num = Number(q.replace(/\D/g, ""));
    where.OR = [
      ...(num && q.replace(/\D/g, "").length < 7 ? [{ number: num }] : []),
      { user: { phone: { contains: q.replace(/[^\d+]/g, "") || q } } },
      { user: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  const [orders, count] = await Promise.all([
    db.order.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER,
      include: { user: true, service: true, plan: true, visits: { where: { scheduledAt: { gte: new Date() }, status: { in: ["SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS"] } }, orderBy: { scheduledAt: "asc" }, take: 1, include: { master: true } } },
    }),
    db.order.count({ where }),
  ]);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/admin/orders?${p}`;
  };
  return (
    <div>
      <PageHead title={t("orders.title")} sub={count} />
      <form className="mb-3 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder={t("orders.searchPh")} className="input max-w-sm flex-1" />
        <select name="status" defaultValue={sp.status || ""} className="input w-auto">
          <option value="">{t("common.status")}: {t("common.all")}</option>
          {["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"].map((s) => <option key={s} value={s}>{to(`status.${s}`)}</option>)}
        </select>
        <select name="kind" defaultValue={sp.kind || ""} className="input w-auto">
          <option value="">{t("orders.kind")}: {t("common.all")}</option>
          {["ONE_TIME", "SUBSCRIPTION", "PACKAGE"].map((s) => <option key={s} value={s}>{ts(`kind.${s}`)}</option>)}
        </select>
        <button className="btn-dark">{t("common.filter")}</button>
      </form>
      <Table head={[t("orders.number"), t("orders.client"), t("orders.service"), t("orders.nextVisit"), t("orders.total"), t("common.status"), t("orders.created")]} empty={!orders.length}>
        {orders.map((o) => {
          const v = o.visits[0];
          return (
            <tr key={o.id} className="hover:bg-surface/50">
              <td className="px-3 py-2.5 font-semibold"><Link href={`/admin/orders/${o.id}`} className="underline-offset-2 hover:underline">№{o.number}</Link></td>
              <td className="px-3 py-2.5"><div className="font-medium">{o.user.name || "—"}</div><div className="text-xs text-muted">{formatPhone(o.user.phone)}</div></td>
              <td className="px-3 py-2.5"><div>{tr(o.service.title, locale)}</div><div className="text-xs text-muted">{o.plan ? tr(o.plan.title, locale) : ts(`kind.${o.kind}`)}</div></td>
              <td className="px-3 py-2.5 whitespace-nowrap">{v ? <><div>{dateLabel(v.scheduledAt!, locale, { day: "numeric", month: "short" })}, {hm(v.scheduledAt!)}</div><div className="text-xs text-muted">{v.master ? tr(v.master.name, locale) : <span className="text-bad">{t("orders.noMaster")}</span>}</div></> : "—"}</td>
              <td className="px-3 py-2.5 whitespace-nowrap"><div className="font-semibold">{amd(o.kind === "SUBSCRIPTION" ? o.pricePerVisit : o.total)}</div><div className="text-xs text-muted">{to(`payStatus.${o.paymentStatus}`)}</div></td>
              <td className="px-3 py-2.5"><StatusBadge status={o.status} label={to(`status.${o.status}`)} className="mt-0" /></td>
              <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted">{dateLabel(o.createdAt, locale, { day: "numeric", month: "short" })} {hm(o.createdAt)}</td>
            </tr>
          );
        })}
      </Table>
      {count > PER && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          {page > 1 && <Link className="btn-outline btn-sm" href={qs({ page: String(page - 1) })}>{t("common.prev")}</Link>}
          <span>{t("common.page", { n: page })}</span>
          {page * PER < count && <Link className="btn-outline btn-sm" href={qs({ page: String(page + 1) })}>{t("common.next")}</Link>}
        </div>
      )}
    </div>
  );
}
