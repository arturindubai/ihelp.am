import { defaultLocale, localeIso, type Locale } from "@/i18n/locales";
import type { Settings } from "@/server/settings";

/** Альтернативные ссылки для hreflang; path — часть пути без локали, напр. "" (главная) или "/s/regular-cleaning" */
export function buildAlternates(path: string, locale: string, indexableLocales: string[]) {
  const suffix = path;
  return {
    canonical: `/${locale}${suffix}`,
    languages: {
      ...Object.fromEntries(
        indexableLocales.map((l) => [localeIso[l as Locale], `/${l}${suffix}`])
      ),
      "x-default": `/${defaultLocale}${suffix}`,
    },
  };
}

/** JSON-LD «Организация» для главной страницы */
export function buildOrgJsonLd(s: Settings, baseUrl: string): object {
  const org: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    name: s.brand.name,
    url: baseUrl,
    address: { "@type": "PostalAddress", addressLocality: "Yerevan", addressCountry: "AM" },
    openingHours: "Mo-Su 09:00-21:00",
  };
  if (s.brand.phone) org.telephone = s.brand.phone;
  if (s.brand.email) org.email = s.brand.email;
  return org;
}

/** JSON-LD «Услуга» для страницы услуги */
export function buildServiceJsonLd(title: string, description: string, minPrice: number, slug: string, baseUrl: string): object {
  const svc: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: title,
    provider: { "@type": "Organization", name: "iHelp" },
    areaServed: { "@type": "City", name: "Yerevan" },
    url: `${baseUrl}/s/${slug}`,
  };
  if (description) svc.description = description;
  if (minPrice > 0 && Number.isFinite(minPrice)) {
    svc.offers = {
      "@type": "Offer",
      priceCurrency: "AMD",
      price: minPrice,
    };
  }
  return svc;
}
