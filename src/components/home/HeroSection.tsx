"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Img } from "@/components/Img";
import { Search } from "lucide-react";
import { SubcategoriesSheet } from "./SubcategoriesSheet";
import { NotifyPopup } from "@/components/catalog/NotifyPopup";
import { locales, defaultLocale } from "@/i18n/locales";
import { amd } from "@/lib/format";

type SubcategoryItem = {
  slug: string;
  title: string;
  subtitle: string | null;
  image: string | null;
  href: string;
};

type SubcategoryGroup = {
  section: string | null;
  items: SubcategoryItem[];
};

type Category = {
  slug: string;
  title: string;
  image: string | null;
  comingSoon: boolean;
  href: string | null;
  subcategories: SubcategoryGroup[];
};

type SearchResult = {
  slug: string;
  title: string;
  category: string;
  price: number | null;
  comingSoon: boolean;
  href: string;
};

type Props = {
  heroTitle: string;
  searchPlaceholder: string;
  comingSoonLabel: string;
  categories: Category[];
  slogan: string;
  autoMode: boolean;
};

export function HeroSection({ heroTitle, searchPlaceholder, comingSoonLabel, categories, slogan, autoMode }: Props) {
  const router = useRouter();
  const th = useTranslations("home");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [openNotifySlug, setOpenNotifySlug] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const locale = (locales as readonly string[]).find((l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`) ?? defaultLocale;

  const fetchResults = useCallback(async (q: string, loc: string) => {
    if (q.length < 2) { setResults(null); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&locale=${loc}`);
      if (res.ok) setResults(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length >= 2) {
      setLoading(true);
      setDropOpen(true);
      debounceRef.current = setTimeout(() => fetchResults(q, locale), 300);
    } else {
      setResults(null);
      setDropOpen(false);
    }
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setDropOpen(false);
    router.push(`/services`);
  }

  const openCategory = categories.find((c) => c.slug === openSlug);
  const topCategories = categories.slice(0, 4);

  return (
    <section className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
      <div className="lg:col-span-5">
        <h1 className="h1 mt-0.5">{heroTitle}</h1>
        <p className="mt-2 hidden text-sm text-muted lg:block">{slogan}</p>
        <div ref={dropRef} className="relative mt-4">
          <form onSubmit={handleSearch}>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted z-10" size={18} />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={handleQueryChange}
              onFocus={() => query.length >= 2 && setDropOpen(true)}
              placeholder={searchPlaceholder}
              className="w-full rounded-xl bg-surface py-3 pl-9 pr-4 text-sm text-ink placeholder:text-muted outline-none focus:ring-2 focus:ring-brand"
            />
          </form>
          {dropOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-paper border border-line rounded-xl shadow-lg z-50 overflow-hidden">
              {loading && (
                <div className="flex items-center justify-center gap-1.5 py-4 px-4">
                  <span className="size-1.5 rounded-full bg-muted animate-bounce [animation-delay:0ms]" />
                  <span className="size-1.5 rounded-full bg-muted animate-bounce [animation-delay:150ms]" />
                  <span className="size-1.5 rounded-full bg-muted animate-bounce [animation-delay:300ms]" />
                </div>
              )}
              {!loading && results && results.length > 0 && results.map((r) => (
                <Link
                  key={r.slug}
                  href={r.href}
                  onClick={() => setDropOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface cursor-pointer"
                >
                  <Search size={16} className="text-muted shrink-0" />
                  <span className="flex-1 text-sm font-medium text-ink truncate">{r.title}</span>
                  <span className="text-xs text-muted shrink-0">{r.category}</span>
                  {r.comingSoon ? (
                    <span className="bg-badge text-on-badge text-[10px] px-1.5 py-0.5 rounded-full shrink-0">
                      {comingSoonLabel}
                    </span>
                  ) : r.price !== null ? (
                    <span className="text-xs text-brand shrink-0">{tc("from", { price: amd(r.price) })}</span>
                  ) : null}
                </Link>
              ))}
              {!loading && results && results.length === 0 && (
                <div className="py-4 px-4">
                  <p className="text-sm text-muted text-center">{th("searchEmpty", { q: query })}</p>
                  <p className="mt-2 text-sm text-muted text-center">{th("searchEmptyHint")}</p>
                  <div className="mt-3 flex flex-wrap gap-2 justify-center">
                    {topCategories.map((c) => c.href && (
                      <Link
                        key={c.slug}
                        href={c.href}
                        onClick={() => setDropOpen(false)}
                        className="chip"
                      >
                        {c.title}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-7 lg:mt-0 lg:gap-2">
        {categories.map((c, i) => {
          const isFirst = i === 0;
          const wrapperClass = isFirst ? "lg:col-span-2 lg:row-span-2" : undefined;
          const tile = (
            <div
              className={`relative overflow-hidden rounded-2xl${c.comingSoon ? " opacity-75" : ""}${
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
                <span className="absolute left-1.5 top-1.5 rounded-full bg-badge px-1.5 py-0.5 text-[10px] font-bold text-on-badge">
                  {comingSoonLabel}
                </span>
              )}
              <div className="absolute bottom-0 left-0 right-0 p-2">
                <span className="text-[13px] font-medium leading-tight text-inverse">{c.title}</span>
              </div>
            </div>
          );

          if (c.comingSoon) {
            return (
              <button
                key={c.slug}
                type="button"
                onClick={() => setOpenNotifySlug(c.slug)}
                className={wrapperClass}
              >
                {tile}
              </button>
            );
          }
          if (c.subcategories.length > 0) {
            return (
              <button
                key={c.slug}
                type="button"
                onClick={() => setOpenSlug(c.slug)}
                className={wrapperClass}
              >
                {tile}
              </button>
            );
          }
          return c.href ? (
            <Link
              key={c.slug}
              href={c.href}
              className={wrapperClass}
            >
              {tile}
            </Link>
          ) : (
            <div key={c.slug} className={wrapperClass}>
              {tile}
            </div>
          );
        })}
      </div>

      {openCategory && openCategory.subcategories.length > 0 && (
        <SubcategoriesSheet
          open={true}
          onClose={() => setOpenSlug(null)}
          title={openCategory.title}
          groups={openCategory.subcategories}
        />
      )}

      <NotifyPopup
        open={openNotifySlug !== null}
        onClose={() => setOpenNotifySlug(null)}
        categorySlug={openNotifySlug}
        categoryTitle={categories.find((c) => c.slug === openNotifySlug)?.title ?? ""}
        autoMode={autoMode}
      />
    </section>
  );
}
