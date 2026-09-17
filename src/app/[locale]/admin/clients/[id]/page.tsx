import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db";
import { pageUser } from "@/server/adminPage";
import { tr } from "@/i18n/locales";
import { amd, dateLabel } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { StatusBadge } from "@/components/account/StatusBadge";
import { ClientControls } from "@/components/admin/ClientControls";

export default async function AdminClient({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await pageUser("clients"))) return <Forbidden />;
  const u = await db.user.findUnique({ where: { id }, include: { addresses: true, orders: { orderBy: { createdAt: "desc" }, include: { service: true, plan: true } }, reviews: { orderBy: { createdAt: "desc" } } } });
  if (!u) notFound();
  const [t, to, ta] = await Promise.all([getTranslations("admin"), getTranslations("order"), getTranslations("address")]);
  return (
    <div className="max-w-4xl">
      <PageHead title={u.name || formatPhone(u.phone)} sub={`${formatPhone(u.phone)} · ${t(`staff.roles.${u.role}`)} · ${dateLabel(u.createdAt, locale, { day: "numeric", month: "long", year: "numeric" })} · ${u.privacyConsentAt ? t("clients.consentAt", { date: dateLabel(u.privacyConsentAt, locale, { day: "numeric", month: "long", year: "numeric" }) }) : t("clients.noConsent")}`} actions={<a href={`https://wa.me/${u.phone.replace("+", "")}`} target="_blank" className="btn-outline btn-sm">WhatsApp</a>} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <section className="card p-4">
            <h2 className="h3 mb-2">{t("clients.orders")} ({u.orders.length})</h2>
            <ul className="divide-y divide-line">
              {u.orders.map((o) => (
                <li key={o.id}><Link href={`/admin/orders/${o.id}`} className="flex items-center gap-3 py-2 text-sm"><span className="w-12 font-semibold">№{o.number}</span><span className="flex-1">{tr(o.service.title, locale)} · {o.plan ? tr(o.plan.title, locale) : ""}</span><span>{amd(o.kind === "SUBSCRIPTION" ? o.pricePerVisit : o.total)}</span><StatusBadge status={o.status} label={to(`status.${o.status}`)} className="mt-0" /></Link></li>
              ))}
            </ul>
          </section>
          <section className="card p-4">
            <h2 className="h3 mb-2">{t("clients.addresses")}</h2>
            <ul className="space-y-1 text-sm">{u.addresses.map((a) => <li key={a.id}>📍 {[a.district, `${a.street} ${a.building}`, a.apartment && ta("aptShort", { n: a.apartment })].filter(Boolean).join(", ")}{a.comment ? ` — ${a.comment}` : ""}</li>)}</ul>
          </section>
          {u.reviews.length > 0 && <section className="card p-4"><h2 className="h3 mb-2">{t("nav.reviews")}</h2><ul className="space-y-2 text-sm">{u.reviews.map((r) => <li key={r.id}>{"★".repeat(r.rating)} {r.text}</li>)}</ul></section>}
        </div>
        <ClientControls user={{ id: u.id, blocked: u.blocked, adminNotes: u.adminNotes || "", name: u.name || "" }} />
      </div>
    </div>
  );
}
