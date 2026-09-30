import { Link } from "@/i18n/navigation";
import { Img } from "@/components/Img";

type Category = {
  slug: string;
  title: string;
  image: string | null;
  comingSoon: boolean;
  href: string | null;
};

type Props = {
  categories: Category[];
  comingSoonLabel: string;
};

export function CategoryTileGrid({ categories, comingSoonLabel }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {categories.map((c, i) => {
        const isFirst = i === 0;
        const tile = (
          <div
            className={`relative overflow-hidden rounded-2xl aspect-square${c.comingSoon ? " opacity-75" : ""}${isFirst ? " lg:aspect-auto lg:h-full" : ""}`}
          >
            <Img
              src={c.image || "/img/cat-cleaning.svg"}
              fill
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 23vw, 23vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
            {c.comingSoon && (
              <span className="absolute left-1.5 top-1.5 rounded-full bg-badge px-1.5 py-0.5 text-[10px] font-bold text-on-badge">
                {comingSoonLabel}
              </span>
            )}
            <div className="absolute bottom-0 left-0 right-0 p-2">
              <span className="truncate text-[13px] font-medium leading-tight text-inverse">{c.title}</span>
            </div>
          </div>
        );

        const wrapperClass = isFirst ? "lg:col-span-2 lg:row-span-2" : undefined;

        return c.href ? (
          <Link key={c.slug} href={c.href} className={wrapperClass}>
            {tile}
          </Link>
        ) : (
          <div key={c.slug} className={wrapperClass}>
            {tile}
          </div>
        );
      })}
    </div>
  );
}
