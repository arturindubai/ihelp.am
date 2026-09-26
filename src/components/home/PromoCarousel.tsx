import { Link } from "@/i18n/navigation";
import { Img } from "@/components/Img";

type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  image: string | null;
  link: string | null;
  bg: string | null;
  promoCode: string | null;
};

type Props = {
  banners: Banner[];
};

export function PromoCarousel({ banners }: Props) {
  if (banners.length === 0) return null;

  return (
    <div className="no-scrollbar -mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4">
      {banners.map((b) => {
        const inner = (
          <div
            className="relative flex h-40 w-[86vw] max-w-[440px] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-2xl p-4 text-inverse"
            style={{ background: b.bg || "var(--color-ink)" }}
          >
            {b.image && (
              <Img src={b.image} fill sizes="(max-width: 512px) 86vw, 440px" className="object-cover opacity-60" />
            )}
            <div className="relative">
              <div className="text-2xl leading-tight font-bold">{b.title}</div>
              {b.subtitle && <div className="mt-1 text-sm opacity-85">{b.subtitle}</div>}
              {b.promoCode && (
                <span className="mt-2 inline-block rounded-md bg-paper px-2 py-0.5 text-xs font-bold text-ink">
                  {b.promoCode}
                </span>
              )}
            </div>
          </div>
        );
        return b.link ? (
          <Link key={b.id} href={b.link}>
            {inner}
          </Link>
        ) : (
          <div key={b.id}>{inner}</div>
        );
      })}
    </div>
  );
}
