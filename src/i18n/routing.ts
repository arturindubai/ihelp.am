import { defineRouting } from "next-intl/routing";
import { locales, defaultLocale } from "./locales";

export const routing = defineRouting({
  locales: [...locales],
  defaultLocale,
  localePrefix: "always",
  localeDetection: false,
});
