import { type NextRequest } from "next/server";
import { requireSection } from "@/server/admin";
import { interestContactsCsv } from "@/server/services/serviceInterest";

export async function GET(req: NextRequest) {
  try {
    await requireSection("services");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const slug = new URL(req.url).searchParams.get("slug") || undefined;
  const csv = await interestContactsCsv(slug);
  const filename = slug ? `interest_${slug}.csv` : "interest_all.csv";

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
