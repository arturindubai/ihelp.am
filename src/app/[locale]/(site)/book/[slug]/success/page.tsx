import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth";

export default async function BookSuccessPage({ params, searchParams }: { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ orderId?: string }> }) {
  const { locale, slug } = await params;
  const { orderId } = await searchParams;
  setRequestLocale(locale);

  if (!orderId) return redirect({ href: `/book/${slug}`, locale });

  const user = await getCurrentUser();
  if (!user) return redirect({ href: `/login?next=/book/${slug}/success?orderId=${orderId}`, locale });

  return redirect({ href: `/account/orders/${orderId}?new=1`, locale });
}
