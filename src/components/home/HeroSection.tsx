"use client";

import { useRouter, Link } from "@/i18n/navigation";
import { Img } from "@/components/Img";
import { Search } from "lucide-react";
import { useRef } from "react";

type Category = {
  slug: string;
  title: string;
  image: string | null;
  comingSoon: boolean;
  href: string | null;
};

type Props = {
  heroTitle: string;
  searchPlaceholder: string;
  comingSoonLabel: string;
  categories: Category[];
  slogan: string;
};

export function HeroSection({ heroTitle, searchPlaceholder, comingSoonLabel, categories, slogan }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = inputRef.current?.value.trim();
    router.push(q ? `/services` : `/services`);
  }

  return (
    <section className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
      <div className="lg:col-span-5">
        <h1 className="h1 mt-0.5">{heroTitle}</h1>
        <p className="mt-2 hidden text-sm text-muted lg:block">{slogan}</p>
        <form onSubmit={handleSearch} className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input
            ref={inputRef}
            type="search"
            placeholder={searchPlaceholder}
            className="w-full rounded-xl bg-surface py-3 pl-9 pr-4 text-sm text-ink placeholder:text-muted outline-none focus:ring-2 focus:ring-brand"
          />
        </form>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-7 lg:mt-0 lg:gap-2">
        {categories.map((c, i) => {
          const isFirst = i === 0;
          const tile = (
            <div
              className={`relative overflow-hidden rounded-2xl${c.comingSoon ? " opacity-60" : ""}${
                isFirst
                  ? " aspect-square lg:aspect-auto lg:h-full"
                  : " aspect-square"
              }`}
            >
              <Img
                src={c.image || "/img/cat-cleaning.svg"}
                fill
                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 20vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
              {c.comingSoon && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-badge px-1.5 py-0.5 text-[10px] font-semibold text-on-badge">
                  {comingSoonLabel}
                </span>
              )}
              <div className="absolute bottom-0 left-0 right-0 p-2">
                <span className="text-[13px] font-medium leading-tight text-inverse">{c.title}</span>
              </div>
            </div>
          );
          return c.href ? (
            <Link
              key={c.slug}
              href={c.href}
              className={isFirst ? "block lg:col-span-2 lg:row-span-2" : undefined}
            >
              {tile}
            </Link>
          ) : (
            <div key={c.slug} className={isFirst ? "lg:col-span-2 lg:row-span-2" : undefined}>
              {tile}
            </div>
          );
        })}
      </div>
    </section>
  );
}
