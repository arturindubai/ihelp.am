"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Mail } from "lucide-react";
import { finishSignupAction, startSignupEmailAction } from "@/server/actions/auth";
import { formatPhone } from "@/lib/phone";
import { Link } from "@/i18n/navigation";

/**
 * Завершение регистрации (AUTH-11): номер уже подтверждён (код или Telegram, тикет), остаются имя и email.
 * Email подтверждается кодом из письма, и только после этого создаётся аккаунт.
 */
export function SignupCompletion({ ticket, phone, emailEnabled, onDone }: { ticket: string; phone: string; emailEnabled: boolean; onDone: (role: string) => void }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [step, setStep] = useState<"profile" | "code">("profile");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeLength, setCodeLength] = useState(6);
  const [devCode, setDevCode] = useState<string>();
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const errText = (e: string, sec?: number) => (t.has(`errors.${e}`) ? t(`errors.${e}`, { sec: sec ?? 0 }) : tc("error"));

  function sendCode() {
    setError(undefined);
    start(async () => {
      const r = await startSignupEmailAction(ticket, name, email, locale);
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
      const r = await finishSignupAction(ticket, name, email, value);
      if (!r.ok) { verifying.current = ""; return setError(errText(r.error)); }
      onDone(r.role);
    });
  }

  if (!emailEnabled) return <p className="text-muted">{t("signupNoMail")}</p>;

  return (
    <div>
      <h2 className="h3">{t("signupTitle")}</h2>
      <p className="mt-1 mb-4 text-sm text-ok">{t("signupPhoneConfirmed", { phone: formatPhone(phone) })}</p>

      {step === "profile" && (
        <form onSubmit={(e) => { e.preventDefault(); sendCode(); }}>
          <label className="label" htmlFor="signup-name">{t("yourName")}</label>
          <input id="signup-name" className="input" autoFocus value={name} placeholder={t("namePlaceholder")} onChange={(e) => setName(e.target.value)} />
          <label className="label mt-3" htmlFor="signup-email">{t("email")}</label>
          <input id="signup-email" type="email" className="input" autoComplete="email" inputMode="email" value={email} placeholder={t("emailPlaceholder")} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-primary mt-3 w-full" disabled={pending || !name.trim() || !email.trim()}><Mail size={18} /> {t("emailGetCode")}</button>
          <p className="mt-3 text-xs text-muted">
            {t.rich("consent", {
              privacy: (c) => <Link href="/p/privacy" target="_blank" className="underline">{c}</Link>,
              offer: (c) => <Link href="/p/offer" target="_blank" className="underline">{c}</Link>,
            })}
          </p>
        </form>
      )}

      {step === "code" && (
        <div>
          <p className="text-sm text-muted">{t("signupCodeSent", { email })}</p>
          {devCode && <p className="mt-2 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn">{t("devCode", { code: devCode })}</p>}
          <label className="label mt-4" htmlFor="signup-code">{t("code")}</label>
          <input
            id="signup-code"
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
          <button className="btn-primary mt-3 w-full" disabled={pending || code.length < codeLength} onClick={() => verify()}>{t("signupFinish")}</button>
          <div className="mt-4 flex items-center justify-between text-sm">
            <button className="link" onClick={() => { setStep("profile"); setCode(""); verifying.current = ""; }}>{t("changeEmail")}</button>
            {resendIn > 0 ? <span className="text-muted">{t("resendIn", { sec: resendIn })}</span> : <button className="link" disabled={pending} onClick={sendCode}>{t("resend")}</button>}
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
    </div>
  );
}
