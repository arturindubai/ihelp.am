"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Mail, MessageCircle, Send, Smartphone } from "lucide-react";
import { completeSignupAction, sendCodeAction, sendEmailLoginCodeAction, verifyCodeAction, verifyEmailLoginCodeAction } from "@/server/actions/auth";
import { formatPhone } from "@/lib/phone";
import { Link } from "@/i18n/navigation";
import { SignupCompletion } from "./SignupCompletion";

type Channel = "SMS" | "WHATSAPP" | "TELEGRAM";
type Method = "phone" | "email";
const ICONS = { WHATSAPP: MessageCircle, TELEGRAM: Send, SMS: Smartphone };

/**
 * Способы входа: Telegram-бот (telegramBot — имя бота), код из письма (emailEnabled), коды на телефон (channels).
 * Если способ один — сразу он, иначе выбор. signup — тикет регистрации: номер уже подтверждён (бот или код),
 * остаются имя и email с кодом из письма (AUTH-11).
 */
export function LoginForm({
  channels,
  emailEnabled = false,
  telegramBot,
  signup: initialSignup,
  onDone,
}: {
  channels: Channel[];
  emailEnabled?: boolean;
  telegramBot?: string | null;
  signup?: { ticket: string; phone: string };
  onDone: (role: string) => void;
}) {
  const t = useTranslations("auth");
  const methods: Method[] = [...(emailEnabled ? (["email"] as const) : []), ...(channels.length ? (["phone"] as const) : [])];
  const [method, setMethod] = useState<Method | null>(methods.length === 1 && !telegramBot ? methods[0] : null);
  const [signup, setSignup] = useState(initialSignup);

  if (signup) return <SignupCompletion ticket={signup.ticket} phone={signup.phone} emailEnabled={emailEnabled} onDone={onDone} />;
  if (!methods.length && !telegramBot) return <p className="text-muted">{t("noChannels")}</p>;
  const back = methods.length + (telegramBot ? 1 : 0) > 1 ? () => setMethod(null) : undefined;

  if (method === "email") return <EmailLogin onDone={onDone} onBack={back} />;
  if (method === "phone") return <PhoneLogin channels={channels} onDone={onDone} onBack={back} onSignup={(ticket, phone) => setSignup({ ticket, phone })} />;
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{t("chooseMethod")}</p>
      <div className="grid gap-2">
        {telegramBot && (
          <div>
            <a className="btn-primary w-full" href={`https://t.me/${telegramBot}?start=login`} target="_blank" rel="noopener">
              <Send size={18} /> {t("telegram")}
            </a>
            <p className="mt-1 text-center text-xs text-muted">{t("telegramHint")}</p>
          </div>
        )}
        {methods.map((m) => {
          const I = m === "email" ? Mail : Smartphone;
          return (
            <button key={m} className={m === methods[0] && !telegramBot ? "btn-primary" : "btn-outline"} onClick={() => setMethod(m)}>
              <I size={18} /> {t(`method.${m}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BackLink({ onBack }: { onBack?: () => void }) {
  const t = useTranslations("auth");
  return onBack ? <button type="button" className="link mb-3 text-sm" onClick={onBack}>← {t("otherMethods")}</button> : null;
}

/** Вход по коду из письма: только для тех, у кого email подтверждён; ответ одинаков для любого адреса */
function EmailLogin({ onDone, onBack }: { onDone: (role: string) => void; onBack?: () => void }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeLength, setCodeLength] = useState(6);
  const [devCode, setDevCode] = useState<string>();
  const [error, setError] = useState<string>();
  const [resendIn, setResendIn] = useState(0);
  const [pending, start] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const errText = (e: string, sec?: number) => (t.has(`errors.${e}`) ? t(`errors.${e}`, { sec: sec ?? 0 }) : tc("error"));

  function send() {
    setError(undefined);
    start(async () => {
      const r = await sendEmailLoginCodeAction(email, locale);
      if (!r.ok) return setError(errText(r.error, "retryIn" in r ? r.retryIn : undefined));
      setEmail(r.email);
      setDevCode(r.devCode);
      setCodeLength(r.codeLength);
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
      const r = await verifyEmailLoginCodeAction(email, value);
      if (!r.ok) { verifying.current = ""; return setError(errText(r.error)); }
      onDone(r.role);
    });
  }

  return (
    <div>
      <BackLink onBack={onBack} />
      {step === "email" && (
        <form onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label className="label" htmlFor="login-email">{t("email")}</label>
          <input id="login-email" type="email" className="input" autoComplete="email" inputMode="email" value={email} placeholder={t("emailPlaceholder")} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-primary mt-3 w-full" disabled={pending || !email.trim()}><Mail size={18} /> {t("emailGetCode")}</button>
          <p className="mt-3 text-xs text-muted">{t("emailOnlyConfirmed")}</p>
        </form>
      )}

      {step === "code" && (
        <div>
          <p className="text-sm text-muted">{t("emailCodeSent", { email })}</p>
          {devCode && <p className="mt-2 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn">{t("devCode", { code: devCode })}</p>}
          <label className="label mt-4" htmlFor="email-code">{t("code")}</label>
          <input
            id="email-code"
            ref={codeRef}
            className="input text-center text-2xl tracking-[.5em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              setCode(v);
              if (v.length === codeLength) verify(v);
            }}
          />
          <button className="btn-primary mt-3 w-full" disabled={pending || code.length < codeLength} onClick={() => verify()}>
            {t("verify")}
          </button>
          <div className="mt-4 flex items-center justify-between text-sm">
            <button className="link" onClick={() => { setStep("email"); setCode(""); }}>{t("changeEmail")}</button>
            {resendIn > 0 ? <span className="text-muted">{t("resendIn", { sec: resendIn })}</span> : <button className="link" disabled={pending} onClick={send}>{t("resend")}</button>}
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
    </div>
  );
}

function PhoneLogin({ channels, onDone, onBack, onSignup }: { channels: Channel[]; onDone: (role: string) => void; onBack?: () => void; onSignup: (ticket: string, phone: string) => void }) {
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
  const [codeLength, setCodeLength] = useState(4);
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
      const r = await sendCodeAction(phone, ch, locale);
      if (!r.ok) return setError(errText(r.error, "retryIn" in r ? r.retryIn : undefined));
      setNormalized(r.phone!);
      setDevCode(r.devCode);
      setCodeLength(r.codeLength);
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
      if (r.needSignup) return onSignup(r.signupTicket, r.phone);
      setRole(r.role);
      if (r.needName) { setTicket(r.ticket || ""); setStep("name"); }
      else onDone(r.role);
    });
  }

  return (
    <div>
      {step === "phone" && (
        <div>
          <BackLink onBack={onBack} />
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
          <p className="mt-3 text-xs text-muted">
            {t.rich("consent", {
              privacy: (c) => <Link href="/p/privacy" target="_blank" className="underline">{c}</Link>,
              offer: (c) => <Link href="/p/offer" target="_blank" className="underline">{c}</Link>,
            })}
          </p>
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
              if (v.length === codeLength) verify(v);
            }}
          />
          <button className="btn-primary mt-3 w-full" disabled={pending || code.length < codeLength} onClick={() => verify()}>
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
