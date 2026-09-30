"use client";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { I18nInput, RowTools, move } from "@/components/admin/fields";
import { ICON_NAMES, Icon } from "@/components/Icon";
import type { ServicePayload } from "@/server/actions/admin/catalog";

type C = ServicePayload["content"];

export function ContentTab({
  c,
  setContent,
}: {
  c: C;
  setContent: (patch: Partial<C>) => void;
}) {
  const t = useTranslations("admin");

  return (
    <div className="space-y-3">
      {/* Примечание */}
      <details className="card p-4">
        <summary className="cursor-pointer font-medium">{t("services.note")}</summary>
        <div className="mt-3 grid gap-3">
          <I18nInput label={t("services.noteTitle")} value={c.note?.title} onChange={(v) => setContent({ note: { title: v, body: c.note?.body || {} } })} />
          <I18nInput label={t("services.noteBody")} multiline value={c.note?.body} onChange={(v) => setContent({ note: { title: c.note?.title || {}, body: v } })} />
        </div>
      </details>

      {/* Преимущества */}
      <details className="card p-4">
        <summary className="cursor-pointer font-medium">{t("services.benefits")}</summary>
        <div className="mt-3 space-y-2">
          {c.benefits.map((b, i) => (
            <div key={i} className="flex items-end gap-2">
              <select
                className="input w-28 shrink-0"
                value={b.icon}
                onChange={(e) => setContent({ benefits: c.benefits.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)) })}
              >
                {ICON_NAMES.map((n) => <option key={n}>{n}</option>)}
              </select>
              <div className="min-w-0 flex-1">
                <I18nInput value={b.title} onChange={(v) => setContent({ benefits: c.benefits.map((x, j) => (j === i ? { ...x, title: v } : x)) })} />
              </div>
              <RowTools
                onUp={i ? () => setContent({ benefits: move(c.benefits, i, -1) }) : undefined}
                onDelete={() => setContent({ benefits: c.benefits.filter((_, j) => j !== i) })}
              />
            </div>
          ))}
          <button type="button" className="btn-ghost btn-sm" onClick={() => setContent({ benefits: [...c.benefits, { icon: "check", title: {} }] })}>
            <Plus size={14} /> {t("services.addItem")}
          </button>
        </div>
      </details>

      {/* Как это работает */}
      <details className="card p-4">
        <summary className="cursor-pointer font-medium">{t("services.howItWorks")}</summary>
        <div className="mt-3 space-y-3">
          {c.howItWorks.map((h, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-line p-3 md:grid-cols-2">
              <I18nInput label={`${t("services.stepTitle")} ${i + 1}`} value={h.title} onChange={(v) => setContent({ howItWorks: c.howItWorks.map((x, j) => (j === i ? { ...x, title: v } : x)) })} />
              <I18nInput label={t("services.stepBody")} value={h.body} onChange={(v) => setContent({ howItWorks: c.howItWorks.map((x, j) => (j === i ? { ...x, body: v } : x)) })} />
              <div className="md:col-span-2">
                <RowTools
                  onUp={i ? () => setContent({ howItWorks: move(c.howItWorks, i, -1) }) : undefined}
                  onDelete={() => setContent({ howItWorks: c.howItWorks.filter((_, j) => j !== i) })}
                />
              </div>
            </div>
          ))}
          <button type="button" className="btn-ghost btn-sm" onClick={() => setContent({ howItWorks: [...c.howItWorks, { title: {}, body: {} }] })}>
            <Plus size={14} /> {t("services.addItem")}
          </button>
        </div>
      </details>

      {/* Частые вопросы */}
      <details className="card p-4">
        <summary className="cursor-pointer font-medium">{t("services.faq")}</summary>
        <div className="mt-3 space-y-3">
          {c.faq.map((f, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-line p-3">
              <I18nInput label={t("services.question")} value={f.q} onChange={(v) => setContent({ faq: c.faq.map((x, j) => (j === i ? { ...x, q: v } : x)) })} />
              <I18nInput label={t("services.answer")} multiline value={f.a} onChange={(v) => setContent({ faq: c.faq.map((x, j) => (j === i ? { ...x, a: v } : x)) })} />
              <RowTools
                onUp={i ? () => setContent({ faq: move(c.faq, i, -1) }) : undefined}
                onDelete={() => setContent({ faq: c.faq.filter((_, j) => j !== i) })}
              />
            </div>
          ))}
          <button type="button" className="btn-ghost btn-sm" onClick={() => setContent({ faq: [...c.faq, { q: {}, a: {} }] })}>
            <Plus size={14} /> {t("services.addItem")}
          </button>
        </div>
      </details>

      {/* Условия */}
      <details className="card p-4">
        <summary className="cursor-pointer font-medium">{t("services.policy")}</summary>
        <div className="mt-3">
          <I18nInput multiline value={c.policy} onChange={(v) => setContent({ policy: v })} />
        </div>
      </details>
    </div>
  );
}
