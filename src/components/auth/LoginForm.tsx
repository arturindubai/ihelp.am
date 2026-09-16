"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MessageCircle, Send, Smartphone } from "lucide-react";
import { completeSignupAction, sendCodeAction, verifyCodeAction } from "@/server/actions/auth";
import { formatPhone } from "@/lib/phone";

type Channel = "SMS" | "WHATSAPP" | "TELEGRAM";
const ICONS = { WHATSAPP: MessageCircle, TELEGRAM: Send, SMS: Smartphone };

export function LoginForm({ channels, onDone }: { channels: Channel[]; onDone: (role: string) => void }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [step, setStep] = useState<"phone" | "code" | "name">("phone");
  const [phone, setPhone] = useState("+374 ");
  const [normalized, setNormalized] = useState("");
  const [channel, setChannel] = useState<Channel>(channels[0]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [devCode, setDevCode] = useState<string>();
  const [error, setError] = useState<string>();
  const [resendIn, setResendIn] = useState(0);
  const [role, setRole] = useState("CLIENT");
  const [ticket, setTicket] = useState("");
  const [pending, start] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const errText = (e: string, sec?: number) => (t.has(`errors.${e}`) ? t(`errors.${e}`, { sec: sec ?? 0 }) : tc("error"));

  function send(ch: Channel) {
    setError(undefined);
    setChannel(ch);
    start(async () => {
      const r = await sendCodeAction(phone, ch);
      if (!r.ok) return setError(errText(r.error, "retryIn" in r ? r.retryIn : undefined));
      setNormalized(r.phone!);
      setDevCode(r.devCode);
      setResendIn(r.resendIn);
      setStep("code");
      setTimeout(() => codeRef.current?.focus(), 50);
    });
  }

  const verifying = useRef("");
  function verify(value = code) {
    if (verifying.current === value) return;
    verifying.current = value;
    setError(undefined);
    start(async () => {
      const r = await verifyCodeAction(normalized, value, locale);
      if (!r.ok) { verifying.current = ""; return setError(errText(r.error)); }
      setRole(r.role);
      if (r.needName) { setTicket(r.ticket || ""); setStep("name"); }
      else onDone(r.role);
    });
  }

  if (!channels.length) return <p className="text-muted">{t("noChannels")}</p>;

  return (
    <div>
      {step === "phone" && (
        <div>
          <label className="label" htmlFor="phone">{t("phone")}</label>
          <input id="phone" className="input text-lg tracking-wide" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <p className="mt-4 mb-2 text-sm font-medium">{t("getCodeVia")}</p>
          <div className="grid gap-2">
            {channels.map((ch) => {
              const I = ICONS[ch];
              return (
                <button key={ch} disabled={pending} onClick={() => send(ch)} className={ch === channels[0] ? "btn-primary" : "btn-outline"}>
                  <I size={18} /> {t(`channel.${ch}`)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === "code" && (
        <div>
          <p className="text-sm text-muted">{t("codeSent", { channel: t(`channel.${channel}`), phone: formatPhone(normalized) })}</p>
          {devCode && <p className="mt-2 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn">{t("devCode", { code: devCode })}</p>}
          <label className="label mt-4" htmlFor="code">{t("code")}</label>
          <input
            id="code"
            ref={codeRef}
            className="input text-center text-2xl tracking-[.5em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              setCode(v);
              if (v.length === (devCode?.length || 4)) verify(v);
            }}
          />
          <button className="btn-primary mt-3 w-full" disabled={pending || code.length < 4} onClick={() => verify()}>
            {t("verify")}
          </button>
          <div className="mt-4 flex items-center justify-between text-sm">
            <button className="link" onClick={() => { setStep("phone"); setCode(""); }}>{t("changePhone")}</button>
            {resendIn > 0 ? <span className="text-muted">{t("resendIn", { sec: resendIn })}</span> : <button className="link" disabled={pending} onClick={() => send(channel)}>{t("resend")}</button>}
          </div>
        </div>
      )}

      {step === "name" && (
        <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await completeSignupAction(ticket, name); if (!r.ok) return setError(tc("error")); onDone(role); }); }}>
          <label className="label" htmlFor="name">{t("yourName")}</label>
          <input id="name" className="input" autoFocus value={name} placeholder={t("namePlaceholder")} onChange={(e) => setName(e.target.value)} />
          <button className="btn-primary mt-3 w-full" disabled={pending || !name.trim()}>{tc("continue")}</button>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
    </div>
  );
}
