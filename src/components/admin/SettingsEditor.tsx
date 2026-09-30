"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveSettingsAction, testMailAction, testNotifyAction, registerTelegramWebhookAction, findTelegramChatsAction, sendTestNotifyToAction } from "@/server/actions/admin/misc";
import type { Settings } from "@/server/settings";
import type { ContactKey } from "@/lib/contacts";
import { Card, I18nInput, NumInput, TextInput, Toggle } from "./fields";

type FindChatState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; chats: { id: number; title: string; type: string }[] }
  | { status: "error"; msg: string };

function Section<K extends keyof Settings>({ k, title, value, children, hint }: { k: K; title: string; value: Settings[K]; children: React.ReactNode; hint?: string }) {
  const t = useTranslations("admin");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <Card title={title} actions={<button className="btn-primary btn-sm" disabled={pending} onClick={() => start(async () => { await saveSettingsAction(k, value); setSaved(true); setTimeout(() => setSaved(false), 2000); })}>{saved ? t("common.saved") : t("common.save")}</button>}>
      {hint && <p className="-mt-1 mb-3 text-xs text-muted">{hint}</p>}
      {children}
    </Card>
  );
}

export function SettingsEditor({ initial, devMode, lockedContacts = {}, cardIntegrated = false, googleRedirect = "", appleRedirect = "" }: { initial: Settings; devMode: boolean; lockedContacts?: Partial<Record<ContactKey, string>>; cardIntegrated?: boolean; googleRedirect?: string; appleRedirect?: string }) {
  const t = useTranslations("admin.settings");
  const [s, setS] = useState(initial);
  const [sentResult, setSentResult] = useState<{ teamConfigured: boolean; techConfigured: boolean; techSeparate: boolean } | null>(null);
  const [mailTo, setMailTo] = useState("");
  const [mailSent, setMailSent] = useState<string | null>(null);
  const [tgWebhook, setTgWebhook] = useState<string | null>(null);
  const [findTeam, setFindTeam] = useState<FindChatState>({ status: "idle" });
  const [findTech, setFindTech] = useState<FindChatState>({ status: "idle" });
  const [testTeamResult, setTestTeamResult] = useState<string | null>(null);
  const [testTechResult, setTestTechResult] = useState<string | null>(null);
  const set = <K extends keyof Settings>(k: K, v: Partial<Settings[K]>) => setS((x) => ({ ...x, [k]: { ...x[k], ...v } }));

  async function handleFindChats(setter: (s: FindChatState) => void) {
    setter({ status: "loading" });
    const r = await findTelegramChatsAction();
    if (!r.ok) { setter({ status: "error", msg: t(`findChatError.${r.error}` as "findChatError.noToken") }); return; }
    if (r.chats.length === 0) { setter({ status: "error", msg: t("findChatEmpty") }); return; }
    setter({ status: "found", chats: r.chats });
  }

  function ChatPicker({ state, onSelect }: { state: FindChatState; onSelect: (id: string) => void }) {
    if (state.status === "loading") return <p className="mt-1 text-xs text-muted">{t("findChatLoading")}</p>;
    if (state.status === "error") return <p className="mt-1 text-xs text-bad">{state.msg}</p>;
    if (state.status === "found") return (
      <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
        {state.chats.map((c) => (
          <li key={c.id}>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface" onClick={() => onSelect(String(c.id))}>
              <span className="flex-1 font-medium">{c.title}</span>
              <span className="shrink-0 text-xs text-muted">{c.type} · {c.id}</span>
            </button>
          </li>
        ))}
      </ul>
    );
    return null;
  }

  const b = s.brand, bk = s.booking, pr = s.pricing, o = s.otp;
  const contact = (k: ContactKey, type = "text") => {
    const env = lockedContacts[k];
    return <TextInput label={t(k)} type={type} value={b[k]} disabled={!!env} hint={env ? t("envLocked", { name: env }) : undefined} onChange={(v) => set("brand", { [k]: v } as Partial<Settings["brand"]>)} />;
  };

  return (
    <div className="space-y-4">
      <Section k="brand" title={t("brand")} value={s.brand}>
        <div className="grid gap-3 md:grid-cols-2">
          <TextInput label={t("brandName")} value={b.name} onChange={(v) => set("brand", { name: v })} />
          <I18nInput label={t("city")} value={b.city} onChange={(v) => set("brand", { city: v as Record<string, string> })} />
          <div className="md:col-span-2"><I18nInput label={t("tagline")} value={b.tagline} onChange={(v) => set("brand", { tagline: v as Record<string, string> })} /></div>
          {contact("phone", "tel")}
          {contact("whatsapp", "tel")}
          {contact("telegram")}
          {contact("email", "email")}
          {contact("instagram")}
        </div>
      </Section>

      <Section k="locales" title={t("locales")} value={s.locales} hint={t("localesHint")}>
        <Toggle label={t("langRu")} checked onChange={() => {}} />
        <Toggle label="ENG — English" checked={s.locales.enabled.includes("en")} onChange={(v) => set("locales", { enabled: v ? [...s.locales.enabled, "en"] : s.locales.enabled.filter((x) => x !== "en") })} />
        <Toggle label="ARM — Հայերեն" checked={s.locales.enabled.includes("am")} onChange={(v) => set("locales", { enabled: v ? [...s.locales.enabled, "am"] : s.locales.enabled.filter((x) => x !== "am") })} />
      </Section>

      <Section k="booking" title={t("booking")} value={s.booking}>
        <div className="grid gap-3 md:grid-cols-2">
          <NumInput label={t("slotStep")} value={bk.slotStepMin} onChange={(v) => set("booking", { slotStepMin: v ?? 30 })} />
          <NumInput label={t("buffer")} value={bk.bufferMin} onChange={(v) => set("booking", { bufferMin: v ?? 0 })} />
          <NumInput label={t("leadHours")} value={bk.leadHours} onChange={(v) => set("booking", { leadHours: v ?? 0 })} />
          <NumInput label={t("horizon")} value={bk.horizonDays} onChange={(v) => set("booking", { horizonDays: v ?? 14 })} />
          <NumInput label={t("freeCancel")} value={bk.freeCancelHours} onChange={(v) => set("booking", { freeCancelHours: v ?? 24 })} />
          <NumInput label={t("subHorizon")} value={bk.subscriptionHorizonDays} onChange={(v) => set("booking", { subscriptionHorizonDays: v ?? 28 })} />
          <div className="md:col-span-2"><Toggle label={t("allowChooseMaster")} checked={bk.allowChooseMaster} onChange={(v) => set("booking", { allowChooseMaster: v })} /></div>
          <div className="md:col-span-2"><label className="label">{t("districts")}</label><textarea className="input min-h-32 py-2" value={bk.districts.join("\n")} onChange={(e) => set("booking", { districts: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} /></div>
        </div>
      </Section>

      <Section k="pricing" title={t("pricing")} value={s.pricing}>
        <div className="grid gap-3 md:grid-cols-2">
          <NumInput label={t("roundTo")} value={pr.roundTo} onChange={(v) => set("pricing", { roundTo: v ?? 1 })} />
          <NumInput label={t("commitmentMin")} value={pr.commitmentMinVisits} onChange={(v) => set("pricing", { commitmentMinVisits: v ?? 4 })} />
          <NumInput label={t("firstVisit")} value={pr.firstVisitDiscount} onChange={(v) => set("pricing", { firstVisitDiscount: v ?? 0 })} />
          <NumInput label={t("firstVisitCommitted")} value={pr.firstVisitCommittedDiscount} onChange={(v) => set("pricing", { firstVisitCommittedDiscount: v ?? 0 })} />
          <div className="md:col-span-2"><Toggle label={t("stack")} checked={pr.stackDiscounts} onChange={(v) => set("pricing", { stackDiscounts: v })} /></div>
        </div>
      </Section>

      <Section k="payments" title={t("payments")} value={s.payments}>
        <Toggle label={t("cash")} checked={s.payments.cashEnabled} onChange={(v) => set("payments", { cashEnabled: v })} />
        <Toggle label={t("card")} checked={s.payments.cardEnabled} disabled={!cardIntegrated} hint={cardIntegrated ? undefined : t("cardLocked")} onChange={(v) => set("payments", { cardEnabled: v })} />
      </Section>

      <Section k="auth" title={t("authSessions")} value={s.auth} hint={t("authSessionsHint")}>
        <div className="grid gap-3 md:grid-cols-2">
          <NumInput label={t("clientSessionDays")} value={s.auth.clientSessionDays} onChange={(v) => set("auth", { clientSessionDays: v ?? 60 })} />
          <NumInput label={t("staffSessionDays")} value={s.auth.staffSessionDays} onChange={(v) => set("auth", { staffSessionDays: v ?? 7 })} />
        </div>
      </Section>

      <Section k="otp" title={t("otp")} value={s.otp} hint={`${t("otpHint")}${devMode ? " (OTP_DEV_MODE=true)" : ""}`}>
        <div className="grid gap-3 md:grid-cols-4">
          <NumInput label={t("codeLength")} value={o.codeLength} onChange={(v) => set("otp", { codeLength: Math.min(6, Math.max(4, v ?? 4)) })} />
          <NumInput label={t("ttl")} value={o.ttlMin} onChange={(v) => set("otp", { ttlMin: v ?? 5 })} />
          <NumInput label={t("resend")} value={o.resendSec} onChange={(v) => set("otp", { resendSec: v ?? 60 })} />
          <NumInput label={t("maxAttempts")} value={o.maxAttempts} onChange={(v) => set("otp", { maxAttempts: v ?? 5 })} />
        </div>
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-line p-3">
            <Toggle label={t("wa")} checked={o.whatsapp.enabled} onChange={(v) => set("otp", { whatsapp: { ...o.whatsapp, enabled: v } })} />
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <TextInput label={t("phoneNumberId")} value={o.whatsapp.phoneNumberId} onChange={(v) => set("otp", { whatsapp: { ...o.whatsapp, phoneNumberId: v } })} />
              <TextInput label={t("accessToken")} hint={t("secretHint")} value={o.whatsapp.accessToken} onChange={(v) => set("otp", { whatsapp: { ...o.whatsapp, accessToken: v } })} />
              <TextInput label={t("templateName")} value={o.whatsapp.templateName} onChange={(v) => set("otp", { whatsapp: { ...o.whatsapp, templateName: v } })} />
              <TextInput label={t("templateLang")} value={o.whatsapp.templateLang} onChange={(v) => set("otp", { whatsapp: { ...o.whatsapp, templateLang: v } })} />
            </div>
          </div>
          <div className="rounded-xl border border-line p-3">
            <Toggle label={t("tg")} checked={o.telegram.enabled} onChange={(v) => set("otp", { telegram: { ...o.telegram, enabled: v } })} />
            <div className="mt-2"><TextInput label={t("gatewayToken")} hint={t("secretHint")} value={o.telegram.gatewayToken} onChange={(v) => set("otp", { telegram: { ...o.telegram, gatewayToken: v } })} /></div>
          </div>
          <div className="rounded-xl border border-line p-3">
            <Toggle label={t("sms")} checked={o.sms.enabled} onChange={(v) => set("otp", { sms: { ...o.sms, enabled: v } })} />
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <TextInput label={t("accountSid")} value={o.sms.accountSid} onChange={(v) => set("otp", { sms: { ...o.sms, accountSid: v } })} />
              <TextInput label={t("authToken")} hint={t("secretHint")} value={o.sms.authToken} onChange={(v) => set("otp", { sms: { ...o.sms, authToken: v } })} />
              <TextInput label={t("from")} value={o.sms.from} onChange={(v) => set("otp", { sms: { ...o.sms, from: v } })} />
            </div>
          </div>
        </div>
      </Section>

      <Section k="google" title={t("google")} value={s.google} hint={t("googleHint")}>
        <Toggle label={t("googleEnabled")} checked={s.google.enabled} onChange={(v) => set("google", { enabled: v })} />
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <TextInput label={t("clientId")} value={s.google.clientId} onChange={(v) => set("google", { clientId: v })} />
          <TextInput label={t("clientSecret")} hint={t("secretHint")} value={s.google.clientSecret} onChange={(v) => set("google", { clientSecret: v })} />
        </div>
        {googleRedirect && (
          <p className="mt-2 text-xs text-muted">
            {t("googleRedirect")}: <code className="font-mono">{googleRedirect}</code>
          </p>
        )}
      </Section>

      <Section k="apple" title={t("apple")} value={s.apple} hint={t("appleHint")}>
        <Toggle label={t("appleEnabled")} checked={s.apple.enabled} onChange={(v) => set("apple", { enabled: v })} />
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <TextInput label={t("appleTeamId")} value={s.apple.teamId} onChange={(v) => set("apple", { teamId: v })} />
          <TextInput label={t("appleKeyId")} value={s.apple.keyId} onChange={(v) => set("apple", { keyId: v })} />
          <TextInput label={t("appleClientId")} value={s.apple.clientId} onChange={(v) => set("apple", { clientId: v })} />
        </div>
        <div className="mt-2">
          <label className="label">{t("applePrivateKey")}</label>
          <textarea className="input min-h-24 py-2 font-mono text-xs" value={s.apple.privateKey} onChange={(e) => set("apple", { privateKey: e.target.value })} placeholder="-----BEGIN PRIVATE KEY-----" />
          <p className="mt-1 text-xs text-muted">{t("secretHint")}</p>
        </div>
        {appleRedirect && (
          <p className="mt-2 text-xs text-muted">
            {t("appleRedirect")}: <code className="font-mono">{appleRedirect}</code>
          </p>
        )}
      </Section>

      <Section k="telegramWidget" title={t("telegramWidget")} value={s.telegramWidget} hint={t("telegramWidgetHint")}>
        <Toggle label={t("telegramWidgetEnabled")} checked={s.telegramWidget.enabled} onChange={(v) => set("telegramWidget", { enabled: v })} />
      </Section>

      <Section k="mail" title={t("mail")} value={s.mail} hint={t("mailHint")}>
        <Toggle label={t("mailEnabled")} checked={s.mail.enabled} onChange={(v) => set("mail", { enabled: v })} />
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <TextInput label={t("mailApiKey")} hint={t("secretHint")} value={s.mail.apiKey} onChange={(v) => set("mail", { apiKey: v })} />
          <TextInput label={t("mailFrom")} placeholder={t("mailFromPh")} value={s.mail.from} onChange={(v) => set("mail", { from: v })} />
          <TextInput label={t("mailReplyTo")} type="email" value={s.mail.replyTo} onChange={(v) => set("mail", { replyTo: v })} />
          <TextInput label={t("testMailTo")} type="email" value={mailTo} onChange={setMailTo} />
        </div>
        <button
          className="btn-outline btn-sm mt-3"
          onClick={async () => {
            const r = await testMailAction(mailTo);
            setMailSent(r.ok ? t("testMailSent") : ("error" in r ? r.error : "error"));
          }}
        >
          {mailSent ?? t("testMail")}
        </button>
      </Section>

      <Section k="notify" title={t("notify")} value={s.notify} hint={t("notifyHint")}>
        {!s.notify.teamChatId && !s.notify.telegramChatId && (
          <div className="mb-3 rounded-xl border border-bad bg-bad/10 p-2.5 text-sm text-bad">
            {t("teamChatMissing")}{" "}
            <button type="button" className="font-medium underline" onClick={() => handleFindChats(setFindTeam)}>{t("teamChatMissingLink")}</button>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <TextInput label={t("teamChatId")} hint={t("teamChatHint")} value={s.notify.teamChatId} onChange={(v) => { set("notify", { teamChatId: v }); setFindTeam({ status: "idle" }); }} />
            <div className="mt-1 flex flex-wrap gap-2">
              <button type="button" className="btn-outline btn-sm" disabled={findTeam.status === "loading"} onClick={() => handleFindChats(setFindTeam)}>
                {findTeam.status === "loading" ? t("findChatLoading") : t("findTeamChat")}
              </button>
              {s.notify.teamChatId && (
                <button type="button" className="btn-outline btn-sm" onClick={async () => { const r = await sendTestNotifyToAction(s.notify.teamChatId); setTestTeamResult(r.ok ? t("testSent") : ("error" in r ? r.error : "error")); }}>
                  {testTeamResult ?? t("testNotify")}
                </button>
              )}
            </div>
            <ChatPicker state={findTeam} onSelect={(id) => { set("notify", { teamChatId: id }); setFindTeam({ status: "idle" }); }} />
            <p className="mt-1 text-xs text-muted">{t("findChatHint")}</p>
          </div>
          <div>
            <TextInput label={t("techChatId")} hint={t("techChatHint")} value={s.notify.techChatId} onChange={(v) => { set("notify", { techChatId: v }); setFindTech({ status: "idle" }); }} />
            <div className="mt-1 flex flex-wrap gap-2">
              <button type="button" className="btn-outline btn-sm" disabled={findTech.status === "loading"} onClick={() => handleFindChats(setFindTech)}>
                {findTech.status === "loading" ? t("findChatLoading") : t("findTechChat")}
              </button>
              {s.notify.techChatId && (
                <button type="button" className="btn-outline btn-sm" onClick={async () => { const r = await sendTestNotifyToAction(s.notify.techChatId); setTestTechResult(r.ok ? t("testSent") : ("error" in r ? r.error : "error")); }}>
                  {testTechResult ?? t("testNotify")}
                </button>
              )}
            </div>
            <ChatPicker state={findTech} onSelect={(id) => { set("notify", { techChatId: id }); setFindTech({ status: "idle" }); }} />
          </div>
          <TextInput label={t("telegramOrderThreadId")} hint={t("telegramOrderThreadHint")} value={s.notify.telegramOrderThreadId} onChange={(v) => set("notify", { telegramOrderThreadId: v })} />
          <TextInput label={t("telegramTechThreadId")} hint={t("telegramTechThreadHint")} value={s.notify.telegramTechThreadId} onChange={(v) => set("notify", { telegramTechThreadId: v })} />
          <TextInput label={t("telegramTasksThreadId")} hint={t("telegramTasksThreadHint")} value={s.notify.telegramTasksThreadId} onChange={(v) => set("notify", { telegramTasksThreadId: v })} />
          <TextInput label={t("botToken")} hint={t("secretHint")} value={s.notify.telegramBotToken} onChange={(v) => set("notify", { telegramBotToken: v })} />
          <TextInput label={t("chatId")} hint={t("chatIdHint")} value={s.notify.telegramChatId} onChange={(v) => set("notify", { telegramChatId: v })} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            className="btn-outline btn-sm"
            onClick={async () => {
              const r = await testNotifyAction();
              setSentResult({ teamConfigured: r.teamConfigured, techConfigured: r.techConfigured, techSeparate: r.techSeparate });
            }}
          >
            {sentResult == null ? t("testNotify") : sentResult.techSeparate ? t("testSentBoth") : sentResult.techConfigured ? t("testSentTeamOnly") : t("testSentNoChatId")}
          </button>
          <button
            className="btn-outline btn-sm"
            onClick={async () => {
              const r = await registerTelegramWebhookAction();
              setTgWebhook(r.ok ? t("tgWebhookOk", { username: r.username ? `@${r.username}` : "" }) : t(`tgWebhookError.${r.error}` as "tgWebhookError.https"));
            }}
          >
            {t("tgWebhookConnect")}
          </button>
          {tgWebhook && <span className="text-xs text-muted">{tgWebhook}</span>}
        </div>
        <p className="mt-2 text-xs text-muted">{t("tgWebhookHint")}</p>
      </Section>
    </div>
  );
}
