import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { pageUser } from "@/server/adminPage";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { getInterestContacts } from "@/server/services/serviceInterest";
import { Link } from "@/i18n/navigation";
import { Download } from "lucide-react";

export default async function DemandContactsPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug } = await params;
  if (!(await pageUser("services"))) return <Forbidden />;
  if (!slug) notFound();
  const t = await getTranslations("admin.demand");
  const contacts = await getInterestContacts(slug, 200, 0);

  return (
    <div>
      <PageHead
        title={t("contactsTitle", { slug })}
        sub={t("contactsSub", { count: contacts.length })}
        actions={
          <div className="flex gap-2">
            <Link href="/admin/services/demand" className="btn-outline btn-sm">← {t("backToDemand")}</Link>
            <a href={`/api/admin/services/demand/export?slug=${encodeURIComponent(slug)}`} download className="btn-outline btn-sm flex items-center gap-2">
              <Download size={15} /> CSV
            </a>
          </div>
        }
      />
      {contacts.length === 0 ? (
        <div className="card p-8 text-center text-muted">{t("empty")}</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface/60 text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{t("contactsColContact")}</th>
                <th className="px-3 py-2 font-medium">{t("contactsColDate")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 font-mono text-sm">{c.contact}</td>
                  <td className="px-3 py-2 text-muted whitespace-nowrap">
                    {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Yerevan" }).format(c.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
