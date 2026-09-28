import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";

type FaqItem = { id: string; q: string; a: string };

export async function FaqSection({ faq }: { faq: FaqItem[] }) {
  if (!faq.length) return null;
  const t = await getTranslations("home");
  return (
    <section className="mt-6">
      <h2 className="h2 mb-1">{t("faqTitle")}</h2>
      <div className="divide-y divide-line border-t border-line">
        {faq.map((f) => (
          <details key={f.id} className="group">
            <summary className="flex cursor-pointer select-none items-center justify-between py-4 font-medium text-ink">
              {f.q}
              <ChevronRight size={18} className="shrink-0 transition-transform group-open:rotate-90" />
            </summary>
            <div className="pb-4 text-sm leading-relaxed text-muted">{f.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
