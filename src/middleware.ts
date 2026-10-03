import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { defaultLocale } from "./i18n/locales";

const intlMiddleware = createMiddleware(routing);

export default function middleware(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const domain = host.split(":")[0];
  if (domain.startsWith("www.")) {
    const url = req.nextUrl.clone();
    url.hostname = domain.slice(4);
    return NextResponse.redirect(url, 301);
  }
  if (req.nextUrl.pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = `/${defaultLocale}`;
    return NextResponse.redirect(url, 301);
  }
  return intlMiddleware(req);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|uploads|.*\\..*).*)"],
};
