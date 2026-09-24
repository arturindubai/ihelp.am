"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ccCheckKeyAction, ccClearKeyAction, ccConnectTeamBotAction, ccSetKeyAction, ccTeamLinkAction, ccTeamRemoveMemberAction } from "@/server/actions/admin/cc";
import { KEY_GROUPS } from "@/lib/keys";
import { cn } from "@/lib/format";

type Row = { path: string; group: string; check?: string; url?: string; present: boolean; changedAt: string | null; changedBy: string | null };
type Team = { token: boolean; username: string; webhook: string | null; lastError: string | null; members: { telegramId: number; name: string; addedAt: string }[] };

const idOf = (path: string) => path.replace(/\./g, "_");
const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { timeZone: "Asia/Yerevan", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * «Ключи» — как Secrets в админке LIA: один список ключей сервисов. Значение только вводится: в браузер оно
 * не возвращается и в журнал не пишется. У ключей Telegram и Resend — живая проверка. Ниже — бот команды
 */
export function KeysPanel({ rows, team }: { rows: Row[]; team: Team }) {
  const t = useTranslations("admin.cc.keys");
  return (
    <div className="space-y-5">
      <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">🔒 {t("note")}</p>
      {KEY_GROUPS.map((g) => {
        const list = rows.filter((r) => r.group === g);
        if (!list.length) return null;
        return (
          <section key={g} className="card overflow-hidden">
            <div className="border-b border-line bg-surface/60 px-4 py-2 text-sm font-semibold">{t(`groups.${g}`)}</div>
            <ul className="divide-y divide-line">
              {list.map((r) => (
                <KeyRow key={r.path} row={r} />
              ))}
            </ul>
          </section>
        );
      })}
      <TeamBot team={team} tokenSet={rows.some((r) => r.path === "team.botToken" && r.present)} />
    </div>
  );
}

function KeyRow({ row }: { row: Row }) {
  const t = useTranslations("admin.cc.keys");
  const router = useRouter();
  const id = idOf(row.path);
  const [mode, setMode] = useState<null | "edit" | "clear">(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<{ ok: boolean | null; detail: string } | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      const r = await ccSetKeyAction(row.path, value);
      if (!r.ok) return setError(t.has(`errors.${r.error}`) ? t(`errors.${r.error}` as "errors.error") : t("errors.error"));
      setValue("");
      setMode(null);
      setCheck(null);
      router.refresh();
    });
  const clear = () =>
    start(async () => {
      const r = await ccClearKeyAction(row.path);
      if (!r.ok) return setError(t("errors.error"));
      setMode(null);
      setCheck(null);
      router.refresh();
    });
  const runCheck = () =>
    start(async () => {
      setError(null);
      const r = await ccCheckKeyAction(row.path);
      setCheck(r.ok ? r.result : { ok: false, detail: "error" });
    });
  const checkText = (c: { ok: boolean | null; detail: string }) => {
    if (c.detail.startsWith("domains:")) {
      const [, all, ok] = c.detail.split(":");
      return t("checkResult.domains", { all, ok });
    }
    if (c.ok && c.detail.startsWith("@")) return t("checkResult.bot", { name: c.detail });
    return t.has(`checkResult.${c.detail}`) ? t(`checkResult.${c.detail}` as "checkResult.rejected") : c.detail;
  };

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{t(`items.${id}.title` as "items.team_botToken.title")}</span>
            <span className={cn("chip text-[10px]", row.present ? "bg-ok-50 text-ok" : "bg-surface text-muted")}>{row.present ? t("present") : t("missing")}</span>
            {check && <span className={cn("chip text-[10px]", check.ok ? "bg-ok-50 text-ok" : check.ok === null ? "bg-surface text-muted" : "bg-bad-50 text-bad")}>{checkText(check)}</span>}
          </div>
          <p className="text-sm text-muted">{t(`items.${id}.purpose` as "items.team_botToken.purpose")}</p>
          <p className="text-xs text-muted">
            {t("where")}: {t(`items.${id}.how` as "items.team_botToken.how")}
            {row.url && (
              <>
                {" "}
                <a href={row.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                  {new URL(row.url).host}
                </a>
              </>
            )}
          </p>
          {row.changedAt && <p className="text-xs text-muted">{t("changed", { when: when(row.changedAt), who: row.changedBy ?? "—" })}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className="btn-outline btn-sm" disabled={pending} onClick={() => setMode(mode === "edit" ? null : "edit")}>
            {row.present ? t("replace") : t("set")}
          </button>
          {row.check && row.present && (
            <button className="btn-ghost btn-sm" disabled={pending} onClick={runCheck}>
              {t("check")}
            </button>
          )}
          {row.present && (
            <button className="btn-ghost btn-sm text-bad" disabled={pending} onClick={() => setMode(mode === "clear" ? null : "clear")}>
              {t("clear")}
            </button>
          )}
        </div>
      </div>
      {mode === "edit" && (
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {row.path === "apple.privateKey" ? (
            <textarea id={`key-${id}`} className="input min-h-24 flex-1 font-mono text-xs" value={value} onChange={(e) => setValue(e.target.value)} placeholder={t("pastePh")} autoComplete="off" />
          ) : (
            <input id={`key-${id}`} type="password" autoComplete="new-password" className="input h-10 min-w-0 flex-1" value={value} onChange={(e) => setValue(e.target.value)} placeholder={t("pastePh")} autoFocus />
          )}
          <button className="btn-primary btn-sm" disabled={pending || value.trim().length < 8}>
            {pending ? t("saving") : t("save")}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => (setMode(null), setValue(""))}>
            {t("cancel")}
          </button>
        </form>
      )}
      {mode === "clear" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-bad">{t("clearConfirm")}</span>
          <button className="btn-danger btn-sm" disabled={pending} onClick={clear}>
            {t("yes")}
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setMode(null)}>
            {t("no")}
          </button>
        </div>
      )}
      {error && <p className="mt-2 rounded-lg bg-bad-50 px-3 py-2 text-xs text-bad">{error}</p>}
    </li>
  );
}

/** Бот команды: подключение, привязка своего Telegram по ссылке, список привязанных */
function TeamBot({ team, tokenSet }: { team: Team; tokenSet: boolean }) {
  const t = useTranslations("admin.cc.keys.team");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const errText = (e?: string) => (e && t.has(`errors.${e}`) ? t(`errors.${e}` as "errors.error") : t("errors.error"));

  const connect = () =>
    start(async () => {
      setError(null);
      const r = await ccConnectTeamBotAction();
      if (!r.ok) return setError(errText(r.error));
      router.refresh();
    });
  const makeLink = () =>
    start(async () => {
      setError(null);
      const r = await ccTeamLinkAction();
      if (!r.ok) return setError(errText(r.error));
      setLink(r.url);
    });
  const remove = (id: number) =>
    start(async () => {
      await ccTeamRemoveMemberAction(id);
      router.refresh();
    });
  const connected = team.token && !!team.webhook;

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">🤖 {t("title")}</h2>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        <span className={cn("chip text-xs", connected ? "bg-ok-50 text-ok" : "bg-surface text-muted")}>{connected ? t("connected", { name: `@${team.username}` }) : tokenSet ? t("notConnected") : t("noToken")}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {tokenSet && (
          <button className={connected ? "btn-ghost btn-sm" : "btn-primary btn-sm"} disabled={pending} onClick={connect}>
            {connected ? t("reconnect") : t("connect")}
          </button>
        )}
        {connected && (
          <button className="btn-primary btn-sm" disabled={pending} onClick={makeLink}>
            {t("link")}
          </button>
        )}
      </div>
      {!tokenSet && <p className="mt-2 text-sm text-muted">{t("howToken")}</p>}
      {link && (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm">
          {t("linkReady")}{" "}
          <a href={link} target="_blank" rel="noreferrer" className="font-medium text-brand underline">
            {link.replace("https://", "")}
          </a>
          <span className="block text-xs text-muted">{t("linkHint")}</span>
        </p>
      )}
      {team.lastError && connected && <p className="mt-2 text-xs text-warn">{t("lastError", { error: team.lastError })}</p>}
      {connected && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{t("members")}</div>
          {team.members.length === 0 && <p className="text-sm text-muted">{t("noMembers")}</p>}
          <ul className="divide-y divide-line text-sm">
            {team.members.map((m) => (
              <li key={m.telegramId} className="flex items-center justify-between gap-2 py-1.5">
                <span>
                  {m.name} <span className="text-xs text-muted">· {when(m.addedAt)}</span>
                </span>
                <button className="btn-ghost btn-sm text-bad" disabled={pending} onClick={() => remove(m.telegramId)}>
                  {t("remove")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">{t("how")}</p>
      {error && <p className="mt-2 rounded-lg bg-bad-50 px-3 py-2 text-xs text-bad">{error}</p>}
    </section>
  );
}
