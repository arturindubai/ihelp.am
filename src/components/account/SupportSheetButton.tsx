"use client";
import { useState } from "react";
import { Phone, MessageCircle, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { Sheet } from "@/components/ui/Sheet";
import { contactLink } from "@/lib/contacts";
import type { ContactKey } from "@/lib/contacts";

/** Кнопка с открывающейся шторкой контактов поддержки.
 *  Используется в карточке мастера и как ссылка «Поддержка по заказу». */
export function SupportSheetButton({
  contacts,
  orderNumber,
  label,
  className,
}: {
  contacts: Partial<Record<ContactKey, string>>;
  orderNumber: string;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("order");

  const wa = contactLink(contacts, "whatsapp");
  const tg = contactLink(contacts, "telegram");
  const ph = contactLink(contacts, "phone");

  const waHref = wa
    ? `${wa.href}?text=${encodeURIComponent(t("supportWaText", { number: orderNumber }))}`
    : null;

  const items = [
    wa && waHref && { href: waHref, icon: <MessageCircle size={20} className="shrink-0 text-ink" />, label: "WhatsApp" },
    tg && { href: tg.href, icon: <Send size={20} className="shrink-0 text-ink" />, label: "Telegram" },
    ph && { href: ph.href, icon: <Phone size={20} className="shrink-0 text-ink" />, label: ph.label },
  ].filter(Boolean) as { href: string; icon: React.ReactNode; label: string }[];

  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("supportSheet", { number: orderNumber })}
        footer={
          <button onClick={() => setOpen(false)} className="btn-outline w-full">
            {t("supportClose")}
          </button>
        }
      >
        {items.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted">{t("supportEmpty")}</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3 text-sm font-medium text-ink"
              >
                {item.icon}
                {item.label}
              </a>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}
