import "server-only";
import { Img } from "@/components/Img";
import { tr } from "@/i18n/locales";
import { getBannerForSlot } from "@/server/services/banners";
import { getCurrentUser } from "@/server/auth";
import { BannerLink } from "@/components/BannerLink";
import type { BannerPlacement } from "@/lib/banner-select";

type Props = {
  placement: BannerPlacement;
  locale: string;
};

export async function PromoSlot({ placement, locale }: Props) {
  const user = await getCurrentUser();
  const banner = await getBannerForSlot(placement, user?.id);
  if (!banner) return null;

  const title = tr(banner.title, locale) || "";
  const subtitle = tr(banner.subtitle, locale);

  const inner = (
    <div
      className="relative flex h-[100px] w-full flex-col justify-end overflow-hidden rounded-2xl p-4 text-inverse"
      style={{ background: banner.bg || "var(--color-ink)" }}
    >
      {banner.image && (
        <Img src={banner.image} fill sizes="(max-width: 768px) 100vw, 720px" className="object-cover opacity-60" />
      )}
      <div className="relative">
        <div className="text-sm font-bold leading-snug">{title}</div>
        {subtitle && <div className="mt-0.5 text-xs opacity-80">{subtitle}</div>}
        {banner.promoCode && (
          <span className="mt-1.5 inline-block rounded-md bg-paper px-2 py-0.5 font-mono text-xs font-bold uppercase text-ink">
            {banner.promoCode}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="mt-4">
      {banner.link ? <BannerLink bannerId={banner.id} href={banner.link}>{inner}</BannerLink> : inner}
    </div>
  );
}
