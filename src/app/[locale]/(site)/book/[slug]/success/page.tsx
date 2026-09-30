import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckCircle2, Phone, MessageCircle } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { envContacts } from "@/server/contacts";
import { tr } from "@/i18n/locales";
import { amd, dateLabel } from "@/lib/format";
import { contactLink } from "@/lib/contacts";
import { hm } from "@/lib/time";
import { PromoSlot } from "@/components/PromoSlot";
import { ClearCart } from "@/components/ClearCart";

export default async function BookSuccessPage({ params, searchParams }: { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ orderId?: string }> }) {
  const { locale, slug } = await params;
  const { orderId } = await searchParams;
  setRequestLocale(locale);

  if (!orderId) return redirect({ href: `/book/${slug}`, locale });

  const user = await getCurrentUser();
  if (!user) return redirect({ href: `/login?next=/book/${slug}/success?orderId=${orderId}`, locale });

  const [order, t, ta] = await Promise.all([
    db.order.findFirst({
      where: { id: orderId, userId: user.id },
      include: {
        service: true,
        visits: { where: { index: 1 }, include: { master: true }, take: 1 },
      },
    }),
    getTranslations("booking"),
    getTranslations("address"),
  ]);

  if (!order) notFound();

  const visit = order.visits[0];
  const a = order.addressSnapshot as Record<string, string | null>;
  const contacts = envContacts();
  const whatsapp = contactLink(contacts, "whatsapp");
  const telegram = contactLink(contacts, "telegram");
  const phone = contactLink(contacts, "phone");
  const masterName = visit?.master ? tr(visit.master.name, locale) : t("anyMaster");

  return (
    <div className="container-m pb-10 pt-6">
      <ClearCart />
      {/* Заголовок успеха */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-ok-50">
          <CheckCircle2 size={44} className="text-ok" />
        </span>
        <h1 className="text-2xl font-bold">{t("success")}</h1>
        <p className="text-sm text-muted">{t("successSub")}</p>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-text">
          {t("successNumber", { number: String(order.number) })}
        </span>
      </div>

      {/* Карточка визита */}
      <section className="card mt-6 divide-y divide-line">
        <div className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-muted">{t("successDetails")}</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t("serviceLabel")}</dt>
              <dd className="text-right font-medium">{tr(order.service.title, locale)}</dd>
            </div>
            {visit?.scheduledAt && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t("dateTime")}</dt>
                <dd className="text-right font-medium">
                  {dateLabel(visit.scheduledAt, locale, { day: "numeric", month: "long", weekday: "short" })}, {hm(visit.scheduledAt)}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t("master")}</dt>
              <dd className="text-right font-medium">{masterName}</dd>
            </div>
            {(a.street || a.building) && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t("address")}</dt>
                <dd className="text-right font-medium">
                  {[a.street, a.building].filter(Boolean).join(" ")}
                  {a.apartment ? `, ${ta("aptShort", { n: a.apartment })}` : ""}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t border-line pt-2">
              <dt className="font-semibold">{t("payNow")}</dt>
              <dd className="font-bold text-action">{amd(order.total)}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Что дальше */}
      <section className="mt-6">
        <h2 className="mb-3 text-[17px] font-semibold">{t("successNext")}</h2>
        <ol className="space-y-3">
          {([t("successStep1"), t("successStep2"), t("successStep3")] as string[]).map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-text">
                {i + 1}
              </span>
              <span className="pt-0.5 text-sm">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Блок связи */}
      {(whatsapp || telegram || phone) && (
        <section className="mt-6 rounded-[var(--radius-card)] bg-cta p-4 text-on-cta">
          <p className="mb-3 text-sm font-semibold">{t("successHelp")}</p>
          <div className="flex flex-col gap-2">
            {whatsapp && (
              <a href={whatsapp.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-medium opacity-90 hover:opacity-100">
                <MessageCircle size={18} />
                WhatsApp · {whatsapp.label}
              </a>
            )}
            {telegram && (
              <a href={telegram.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-medium opacity-90 hover:opacity-100">
                <MessageCircle size={18} />
                Telegram · {telegram.label}
              </a>
            )}
            {phone && (
              <a href={phone.href} className="flex items-center gap-2 text-sm font-medium opacity-90 hover:opacity-100">
                <Phone size={18} />
                {phone.label}
              </a>
            )}
          </div>
        </section>
      )}

      {/* Кнопка к заказам */}
      <Link href="/account/orders" className="btn-primary mt-6 flex w-full items-center justify-center">
        {t("toOrder")}
      </Link>

      <PromoSlot placement="SUCCESS" locale={locale} />
    </div>
  );
}
