import { getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { pageUser } from "@/server/adminPage";
import { formatPhone } from "@/lib/phone";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { StaffManager } from "@/components/admin/StaffManager";

export default async function AdminStaff() {
  if (!(await pageUser("staff"))) return <Forbidden />;
  const t = await getTranslations("admin");
  const staff = await db.user.findMany({ where: { role: { in: ["OPERATOR", "ADMIN", "OWNER", "MASTER"] } }, orderBy: [{ role: "desc" }, { createdAt: "asc" }] });
  return (
    <div className="max-w-3xl">
      <PageHead title={t("staff.title")} sub={t("staff.hint")} />
      <StaffManager staff={staff.map((u) => ({ phone: u.phone, label: `${u.name || "—"} · ${formatPhone(u.phone)}`, role: u.role }))} />
    </div>
  );
}
