import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/Icon";

type Feature = { id: string; icon: string; title: string; body: string };

export async function Promises({ features }: { features: Feature[] }) {
  if (!features.length) return null;
  const t = await getTranslations("home");
  return (
    <section className="mt-6">
      <h2 className="h2 mb-3">{t("promisesTitle")}</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <div key={f.id} className="card space-y-2 p-4">
            <Icon name={f.icon} className="shrink-0 text-brand" size={22} />
            <span className="block font-semibold text-ink">{f.title}</span>
            {f.body && <p className="text-sm text-muted">{f.body}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
