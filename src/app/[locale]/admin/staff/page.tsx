import { getTranslations } from "next-intl/server";
import { pageUser } from "@/server/adminPage";
import { formatPhone } from "@/lib/phone";
import { ymd } from "@/lib/time";
import { getAdminStaff } from "@/server/services/pages/admin";
import { sectionsFor } from "@/lib/adminAccess";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { StaffManager } from "@/components/admin/StaffManager";

export default async function AdminStaff() {
  if (!(await pageUser("staff"))) return <Forbidden />;
  const t = await getTranslations("admin");
  const staff = await getAdminStaff();
  return (
    <div className="max-w-5xl">
      <PageHead title={t("staff.title")} sub={t("staff.manageSub")} />
      <StaffManager
        staff={staff.map((u) => ({
          id: u.id,
          phone: u.phone,
          email: u.email,
          telegramId: u.telegramId,
          name: u.name ?? null,
          label: `${u.name || "—"} · ${formatPhone(u.phone)}`,
          role: u.role,
          lastLoginAt: u.lastLoginAt ? ymd(u.lastLoginAt) : null,
          roleBase: sectionsFor(u.role),
          sectionDelta: (u.sectionDelta as { added?: string[]; removed?: string[] } | null) ?? null,
        }))}
      />
    </div>
  );
}
