import { getTranslations } from "next-intl/server";

export async function HowItWorks() {
  const t = await getTranslations("home");
  return (
    <section className="mt-6 rounded-2xl bg-surface p-4">
      <h2 className="h2 mb-3">{t("howTitle")}</h2>
      <ol className="space-y-3">
        {[t("how1"), t("how2"), t("how3")].map((x, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-inverse">{i + 1}</span>
            <span className="pt-0.5">{x}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
