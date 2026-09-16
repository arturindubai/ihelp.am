"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveSettingsAction, testNotifyAction } from "@/server/actions/admin/misc";
import type { Settings } from "@/server/settings";
import { Card, I18nInput, NumInput, TextInput, Toggle } from "./fields";

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

export function SettingsEditor({ initial, devMode }: { initial: Settings; devMode: boolean }) {
  const t = useTranslations("admin.settings");
  const [s, setS] = useState(initial);
  const [sent, setSent] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Partial<Settings[K]>) => setS((x) => ({ ...x, [k]: { ...x[k], ...v } }));
  const b = s.brand, bk = s.booking, pr = s.pricing, o = s.otp;

  return (
    <div className="space-y-4">
      <Section k="brand" title={t("brand")} value={s.brand}>
        <div className="grid gap-3 md:grid-cols-2">
          <TextInput label={t("brandName")} value={b.name} onChange={(v) => set("brand", { name: v })} />
          <I18nInput label={t("city")} value={b.city} onChange={(v) => set("brand", { city: v as Record<string, string> })} />
          <div className="md:col-span-2"><I18nInput label={t("tagline")} value={b.tagline} onChange={(v) => set("brand", { tagline: v as Record<string, string> })} /></div>
          <TextInput label={t("phone")} type="tel" value={b.phone} onChange={(v) => set("brand", { phone: v })} />
          <TextInput label={t("whatsapp")} type="tel" value={b.whatsapp} onChange={(v) => set("brand", { whatsapp: v })} />
          <TextInput label={t("telegram")} value={b.telegram} onChange={(v) => set("brand", { telegram: v })} />
          <TextInput label={t("email")} value={b.email} onChange={(v) => set("brand", { email: v })} />
          <TextInput label={t("instagram")} value={b.instagram} onChange={(v) => set("brand", { instagram: v })} />
        </div>
      </Section>

      <Section k="locales" title={t("locales")} value={s.locales} hint={t("localesHint")}>
        <Toggle label="RU — Русский" checked onChange={() => {}} />
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
        <Toggle label={t("card")} checked={s.payments.cardEnabled} onChange={(v) => set("payments", { cardEnabled: v })} />
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

      <Section k="notify" title={t("notify")} value={s.notify}>
        <div className="grid gap-3 md:grid-cols-2">
          <TextInput label={t("botToken")} hint={t("secretHint")} value={s.notify.telegramBotToken} onChange={(v) => set("notify", { telegramBotToken: v })} />
          <TextInput label={t("chatId")} value={s.notify.telegramChatId} onChange={(v) => set("notify", { telegramChatId: v })} />
        </div>
        <button className="btn-outline btn-sm mt-3" onClick={async () => { await testNotifyAction(); setSent(true); }}>{sent ? t("testSent") : t("testNotify")}</button>
      </Section>
    </div>
  );
}
