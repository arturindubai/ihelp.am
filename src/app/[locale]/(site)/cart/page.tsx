import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShoppingCart, Tag } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { isFirstOrder } from "@/server/services/booking";
import { getCartDetails, ANON_CART_COOKIE } from "@/server/services/cart";
import { amd } from "@/lib/format";
import { Img } from "@/components/Img";
import { CartItemCounter } from "@/components/cart/CartItemCounter";
import { CartAddButton } from "@/components/cart/CartAddButton";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cart" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [user, settings, t, ts] = await Promise.all([
    getCurrentUser(),
    getSettings(),
    getTranslations("cart"),
    getTranslations("service"),
  ]);

  const anonId = user ? null : ((await cookies()).get(ANON_CART_COOKIE)?.value ?? null);
  const selector = user
    ? ({ userId: user.id } as const)
    : anonId
      ? ({ anonId } as const)
      : null;

  const first = await isFirstOrder(user?.id);

  const details = selector
    ? await getCartDetails(selector, locale, first, settings.pricing)
    : null;

  if (!details || details.items.length === 0) {
    return (
      <div className="container-m py-12 flex flex-col items-center gap-4 text-center">
        <ShoppingCart size={48} className="text-muted" />
        <h2 className="h2">{t("empty")}</h2>
        <p className="text-sm text-muted">{t("emptyHint")}</p>
        <Link href="/" className="btn-primary mt-4">{t("toCatalog")}</Link>
      </div>
    );
  }

  const isMultiple = details.items.length > 1;
  const singleBookHref = !isMultiple
    ? `/book/${details.firstSlug}?o=${details.firstOpts.join(",")}${details.firstPlanId ? `&p=${details.firstPlanId}` : ""}`
    : null;

  const summaryBlock = (
    <div className="space-y-1">
      {details.items.map((item) => (
        <div key={item.cartItemId} className="flex justify-between text-sm">
          <span className="text-muted truncate pr-2">{item.title}</span>
          <span className="font-medium shrink-0">{amd(item.price)}</span>
        </div>
      ))}
      <div className="flex justify-between font-semibold text-[16px] pt-2 border-t border-line">
        <span>{isMultiple ? t("totalCart") : t("total")}</span>
        <span>{amd(details.total)}</span>
      </div>
    </div>
  );

  return (
    <div className={`container-m py-4 md:pb-8 ${isMultiple ? "pb-4" : "pb-32"}`}>
      <h1 className="h1 mb-4">{t("title")}</h1>

      {/* Сетка: на десктопе — позиции слева, итог справа */}
      <div className="md:grid md:grid-cols-[1fr_320px] md:gap-8 md:items-start">

        {/* Позиции корзины */}
        <div className="space-y-3">
          {details.items.map((item) => (
            <div key={item.cartItemId} className="card p-4 flex gap-3">
              <Img
                src={item.image || "/img/svc-regular.svg"}
                width={64}
                className="size-16 rounded-xl object-cover shrink-0"
              />
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <div className="font-semibold text-[15px] leading-snug">{item.title}</div>
                {item.optionSummary && (
                  <div className="text-sm text-muted">{item.optionSummary}</div>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-semibold">{amd(item.price)}</span>
                  {item.basePrice > item.price && (
                    <span className="text-sm text-muted line-through">{amd(item.basePrice)}</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <Link href={`/s/${item.slug}`} className="text-sm text-brand underline underline-offset-2">
                    {t("change")}
                  </Link>
                  <CartItemCounter cartItemId={item.cartItemId} serviceId={item.serviceId} qty={item.qty} />
                </div>
                {isMultiple && (
                  <Link href={item.bookHref} className="btn-primary block text-center mt-2 w-full">
                    {t("checkoutItem")}
                  </Link>
                )}
              </div>
            </div>
          ))}

          {/* Экономия */}
          {details.savings > 0 && (
            <div className="bg-ok-50 rounded-[var(--radius-card)] px-4 py-3 flex items-center gap-2">
              <Tag size={16} className="text-ok shrink-0" />
              <div>
                <div className="text-sm font-medium text-ok">{t("savings", { amount: amd(details.savings) })}</div>
                <div className="text-xs text-muted">{first ? ts("firstVisit") : t("byPlan")}</div>
              </div>
            </div>
          )}

          {/* Часто берут вместе */}
          {details.crossSells.length > 0 && (
            <section className="mt-6">
              <h2 className="text-[16px] font-semibold mb-3">{t("crossSell")}</h2>
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 no-scrollbar pb-1">
                {details.crossSells.map((cs) => (
                  <div key={cs.id} className="w-[180px] shrink-0 snap-start card p-3 flex flex-col">
                    <Img
                      src={cs.image || "/img/svc-regular.svg"}
                      width={56}
                      className="size-14 rounded-xl object-cover"
                    />
                    <div className="mt-2 text-sm font-medium line-clamp-2 flex-1">{cs.title}</div>
                    {cs.fromPrice > 0 && (
                      <div className="text-xs text-brand mt-1">{amd(cs.fromPrice)}</div>
                    )}
                    <CartAddButton
                      serviceId={cs.id}
                      slug={cs.slug}
                      label={ts("addToCart")}
                      className="border border-brand text-brand rounded-xl px-2 py-1 text-xs font-medium hover:bg-brand-50 transition w-full mt-2"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Итог — sticky sidebar на десктопе */}
        <div className="hidden md:block md:sticky md:top-20">
          <div className="card p-4">
            {summaryBlock}
            {singleBookHref && (
              <>
                <Link href={singleBookHref} className="btn-primary w-full block text-center mt-3">
                  {t("checkout")}
                </Link>
                <p className="text-xs text-muted text-center mt-2">{t("cancelPolicy")}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Итог под позициями — только мобайл */}
      <div className="mt-4 border-t border-line pt-3 md:hidden">
        {summaryBlock}
      </div>

      {/* Sticky кнопка оформления — только мобайл, только при одной услуге */}
      {singleBookHref && (
        <div className="pb-safe fixed bottom-0 inset-x-0 z-40 bg-paper border-t border-line px-4 py-3 md:hidden">
          <Link href={singleBookHref} className="btn-primary w-full block text-center">
            {t("checkout")}
          </Link>
          <p className="text-xs text-muted text-center mt-2">{t("cancelPolicy")}</p>
        </div>
      )}
    </div>
  );
}
