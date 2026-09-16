"use client";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Phone, Navigation, Check } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { proCashAction, proStatusAction } from "@/server/actions/pro";
import { amd } from "@/lib/format";

export function ProVisitActions({ visit, phone, mapQuery }: { visit: { id: string; status: string; cashCollected: boolean; price: number; isCash: boolean }; phone: string; mapQuery: string }) {
  const t = useTranslations("pro");
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });
  const next = { SCHEDULED: ["ON_WAY", t("onWay")], CONFIRMED: ["ON_WAY", t("onWay")], ON_WAY: ["IN_PROGRESS", t("start")], IN_PROGRESS: ["DONE", t("finish")] }[visit.status] as [string, string] | undefined;
  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <a href={`tel:${phone}`} className="btn-outline btn-sm"><Phone size={16} /> {t("call")}</a>
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`} target="_blank" className="btn-outline btn-sm"><Navigation size={16} /> {t("route")}</a>
      </div>
      {next && <button className="btn-dark w-full" disabled={pending} onClick={() => run(() => proStatusAction(visit.id, next[0] as "DONE"))}>{next[1]}</button>}
      {visit.isCash && ["IN_PROGRESS", "DONE"].includes(visit.status) && (
        <button className={visit.cashCollected ? "btn w-full bg-ok-50 text-ok" : "btn-primary w-full"} disabled={pending} onClick={() => run(() => proCashAction(visit.id))}>
          {visit.cashCollected ? <><Check size={18} /> {t("cashDone")}</> : t("cashCollected", { amount: amd(visit.price) })}
        </button>
      )}
    </div>
  );
}
