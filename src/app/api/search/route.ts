import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { tr } from "@/i18n/locales";

/** GET /api/search?q=текст&locale=ru — поиск услуг по названию */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const locale = req.nextUrl.searchParams.get("locale") ?? "ru";
  if (q.length < 2) return NextResponse.json([]);

  const services = await db.service.findMany({
    where: {
      active: true,
      category: { active: true, archived: false },
    },
    include: {
      category: { select: { title: true, slug: true } },
      groups: {
        where: { active: true },
        include: { options: { where: { active: true }, select: { price: true } } },
      },
    },
    orderBy: { sort: "asc" },
    take: 50,
  });

  const lower = q.toLowerCase();
  const matched = services.filter((s) => {
    const title = tr(s.title, locale).toLowerCase();
    const subtitle = tr(s.subtitle, locale).toLowerCase();
    const catTitle = tr(s.category.title, locale).toLowerCase();
    return title.includes(lower) || subtitle.includes(lower) || catTitle.includes(lower);
  });

  const results = matched.slice(0, 8).map((s) => {
    const prices = s.groups.flatMap((g) => g.options.map((o) => o.price)).filter((p) => p > 0);
    const fromPrice = prices.length ? Math.min(...prices) : null;
    return {
      slug: s.slug,
      title: tr(s.title, locale),
      category: tr(s.category.title, locale),
      price: fromPrice,
      comingSoon: s.comingSoon,
      href: `/s/${s.slug}`,
    };
  });

  return NextResponse.json(results, {
    headers: { "Cache-Control": "no-store" },
  });
}
