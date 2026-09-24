import { redirect } from "@/i18n/navigation";

/** Воркеры теперь вкладка пульта: старый адрес ведёт туда */
export default async function WorkersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: "/admin/control?tab=workers", locale });
}
