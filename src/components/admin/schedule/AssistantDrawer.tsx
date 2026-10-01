"use client";
import { useState, useEffect, useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { Sparkles, X, Loader2, CheckCircle, AlertCircle, ChevronDown } from "lucide-react";
import {
  requestProposalAction,
  getProposalStatusAction,
  applyProposalAction,
  rejectProposalAction,
  getMonthTokensAction,
} from "@/server/actions/admin/schedule";
import type { ParsedProposal } from "@/server/services/scheduleAssistant";

const POLL_INTERVAL = 2_000;
const POLL_MAX_MS = 3 * 60 * 1_000;

type DrawerState =
  | { kind: "closed" }
  | { kind: "ready" }
  | { kind: "loading"; requestId: string; startedAt: number }
  | { kind: "proposal"; requestId: string; proposal: ParsedProposal }
  | { kind: "success" }
  | { kind: "error"; message: string; requestId?: string }
  | { kind: "no_subscription" };

export function AssistantDrawer({
  unassignedCount,
  masterCount,
  monthTokens: initialMonthTokens,
  date,
  masterIndex,
  visitIndex,
}: {
  unassignedCount: number;
  masterCount: number;
  monthTokens: number;
  date: string;
  masterIndex: Record<string, string>;
  visitIndex: Record<string, { service: string; time: string }>;
}) {
  const t = useTranslations("admin.ai");
  const router = useRouter();
  const [state, setState] = useState<DrawerState>({ kind: "closed" });
  const [monthTokens, setMonthTokens] = useState(initialMonthTokens);
  const [showAll, setShowAll] = useState(false);
  const [, startApply] = useTransition();
  const [, startPropose] = useTransition();
  const isOpen = state.kind !== "closed";
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Esc — закрыть
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setState({ kind: "closed" });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  // Блокировка скролла страницы
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Опрос статуса
  useEffect(() => {
    if (state.kind !== "loading") return;
    const { requestId, startedAt } = state;
    let active = true;

    const tick = async () => {
      if (!active) return;
      if (Date.now() - startedAt > POLL_MAX_MS) {
        setState({ kind: "error", message: "timeout", requestId });
        return;
      }
      const result = await getProposalStatusAction(requestId);
      if (!active) return;
      if (result.status === "done") {
        const tokens = await getMonthTokensAction().catch(() => 0);
        if (active) {
          setMonthTokens(tokens);
          setState({ kind: "proposal", requestId, proposal: result.proposal });
        }
      } else if (result.status === "failed") {
        if (result.noSubscription) {
          setState({ kind: "no_subscription" });
        } else {
          setState({ kind: "error", message: result.error, requestId });
        }
      }
    };

    pollRef.current = setInterval(tick, POLL_INTERVAL);
    return () => {
      active = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const handleOpen = () => {
    setShowAll(false);
    setState({ kind: "ready" });
  };

  const handlePropose = () => {
    startPropose(async () => {
      const r = await requestProposalAction(date);
      if (!r.ok) {
        setState({ kind: "error", message: r.error });
        return;
      }
      setState({ kind: "loading", requestId: r.requestId, startedAt: Date.now() });
    });
  };

  const handleApply = (requestId: string) => {
    startApply(async () => {
      const r = await applyProposalAction(requestId);
      if (!r.ok) {
        setState({ kind: "error", message: r.error, requestId });
        return;
      }
      setState({ kind: "success" });
      router.refresh();
    });
  };

  const handleReject = (requestId: string) => {
    startApply(async () => {
      await rejectProposalAction(requestId);
      setState({ kind: "ready" });
    });
  };

  const handleClose = () => setState({ kind: "closed" });

  const tokenChip = (
    <span className="chip bg-surface text-muted" title={t("costApprox")}>
      {monthTokens.toLocaleString("ru")} {t("tokensLabel")}
    </span>
  );

  return (
    <>
      {/* Кнопка в шапке страницы */}
      {unassignedCount > 0 && (
        <button
          type="button"
          className="btn-outline btn-sm flex items-center gap-1.5"
          onClick={handleOpen}
        >
          <Sparkles size={16} className="text-brand" />
          {t("suggestBtn")}
          <span className="chip bg-bad-50 text-bad">{unassignedCount}</span>
        </button>
      )}

      {/* Drawer overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-overlay/50"
            onClick={handleClose}
          />

          {/* Панель */}
          <div className="absolute inset-y-0 right-0 flex w-full flex-col bg-paper shadow-xl sm:w-96 sm:border-l sm:border-line">
            {/* Шапка (sticky) */}
            <div className="flex shrink-0 items-center gap-2 border-b border-line bg-paper px-4 py-3">
              <button
                type="button"
                className="btn-ghost btn-sm -ml-1 px-2"
                onClick={handleClose}
                aria-label={t("close")}
              >
                <X size={18} />
              </button>
              <span className="flex-1 font-semibold">✦ {t("drawerTitle")}</span>
              {tokenChip}
            </div>

            {/* Контент */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Готов */}
              {state.kind === "ready" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted">
                    {t("statusReady", { unassigned: unassignedCount, masters: masterCount })}
                  </p>
                  <button
                    type="button"
                    className="btn-primary w-full"
                    onClick={handlePropose}
                  >
                    {t("suggestBtn")}
                  </button>
                  <p className="text-xs text-muted text-center">
                    {t("costApprox")}: {monthTokens.toLocaleString("ru")}
                  </p>
                </div>
              )}

              {/* Загрузка */}
              {state.kind === "loading" && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 size={32} className="animate-spin text-brand" />
                  <p className="text-muted">{t("thinking")}</p>
                </div>
              )}

              {/* Предложение */}
              {state.kind === "proposal" && (
                <ProposalView
                  proposal={state.proposal}
                  requestId={state.requestId}
                  masterIndex={masterIndex}
                  visitIndex={visitIndex}
                  showAll={showAll}
                  onShowAll={() => setShowAll(true)}
                  onApply={() => handleApply(state.requestId)}
                  onReject={() => handleReject(state.requestId)}
                  t={t}
                />
              )}

              {/* Успех */}
              {state.kind === "success" && (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <CheckCircle size={40} className="text-ok" />
                  <p className="font-medium">{t("applied")}</p>
                  <button type="button" className="btn-outline" onClick={handleClose}>
                    {t("close")}
                  </button>
                </div>
              )}

              {/* Ошибка */}
              {state.kind === "error" && (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <AlertCircle size={32} className="text-bad" />
                  <p className="text-sm text-bad">{t("errorText")}</p>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setState({ kind: "ready" })}
                  >
                    {t("retry")}
                  </button>
                </div>
              )}

              {/* Нет подписки */}
              {state.kind === "no_subscription" && (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <AlertCircle size={32} className="text-bad" />
                  <p className="text-sm text-muted">{t("balance")}</p>
                  <Link href="/admin/settings" className="btn-outline btn-sm">
                    {t("balanceLow")}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProposalView({
  proposal,
  masterIndex,
  visitIndex,
  showAll,
  onShowAll,
  onApply,
  onReject,
  t,
}: {
  proposal: ParsedProposal;
  requestId: string;
  masterIndex: Record<string, string>;
  visitIndex: Record<string, { service: string; time: string }>;
  showAll: boolean;
  onShowAll: () => void;
  onApply: () => void;
  onReject: () => void;
  t: ReturnType<typeof useTranslations<"admin.ai">>;
}) {
  const PREVIEW = 5;
  const items = proposal.assignments;
  const shown = showAll || items.length <= PREVIEW ? items : items.slice(0, PREVIEW);
  const hidden = items.length - PREVIEW;

  return (
    <div className="space-y-4">
      {/* Список назначений */}
      <div className="card border-brand/30 bg-brand-50 space-y-1 p-3">
        <p className="mb-2 text-sm font-medium">{t("proposalTitle")}</p>
        <ul className="space-y-1.5">
          {shown.map((a) => {
            const visit = visitIndex[a.visitId];
            const masterName = masterIndex[a.masterId] ?? a.masterId;
            return (
              <li
                key={a.visitId}
                className={`rounded-lg px-2 py-1.5 text-sm ${a.valid ? "bg-paper" : "bg-bad-50 text-bad"}`}
              >
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium">
                    {visit ? `${visit.service} ${visit.time}` : a.visitId}
                  </span>
                  <span className="text-muted">→</span>
                  <span>{masterName}</span>
                  <span className="text-muted text-xs">{a.time}</span>
                </div>
                {!a.valid && a.invalidReason && (
                  <p className="mt-0.5 text-xs">{a.invalidReason}</p>
                )}
                {a.valid && a.reason && (
                  <p className="mt-0.5 text-xs text-muted">{a.reason}</p>
                )}
              </li>
            );
          })}
        </ul>
        {!showAll && items.length > PREVIEW && (
          <button
            type="button"
            className="mt-2 flex items-center gap-1 text-xs text-brand"
            onClick={onShowAll}
          >
            <ChevronDown size={14} />
            {t("showMore", { n: hidden })}
          </button>
        )}
      </div>

      {/* Объяснение */}
      {proposal.explanation && (
        <div className="rounded-lg bg-surface p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-muted">{t("explanation")}</p>
          <p className="whitespace-pre-line text-ink">{proposal.explanation}</p>
        </div>
      )}

      {/* Кнопки */}
      <div className="flex gap-2">
        <button type="button" className="btn-primary flex-1" onClick={onApply}>
          {t("apply")}
        </button>
        <button type="button" className="btn-outline flex-1" onClick={onReject}>
          {t("reject")}
        </button>
      </div>
    </div>
  );
}
