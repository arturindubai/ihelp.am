"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MessageCircle, Send, Smartphone } from "lucide-react";
import { completeSignupAction, sendCodeAction, verifyCodeAction } from "@/server/actions/auth";
import { composePhone, formatPhone, splitPhone } from "@/lib/phone";
import { COUNTRIES, DEFAULT_COUNTRY, countryByIso, flagEmoji } from "@/lib/countries";
import { Link } from "@/i18n/navigation";

type Channel = "SMS" | "WHATSAPP" | "TELEGRAM";
const ICONS = { WHATSAPP: MessageCircle, TELEGRAM: Send, SMS: Smartphone };

/** defaultCountry — ISO страны посетителя по IP (AUTH-12), подсказка для селектора; пусто — Армения */
export function LoginForm({
  channels,
  prefill,
  defaultCountry,
  onDone,
}: {
  channels: Channel[];
  prefill?: { email?: string; phone?: string };
  defaultCountry?: string | null;
  onDone: (role: string) => void;
}) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [step, setStep] = useState<"phone" | "code" | "profile">("phone");
  const prefilled = prefill?.phone ? splitPhone(prefill.phone) : null;
  const [iso, setIso] = useState(prefilled?.iso ?? countryByIso(defaultCountry)?.iso ?? DEFAULT_COUNTRY);
  const [national, setNational] = useState(prefilled?.national ?? "");
  const country = countryByIso(iso) ?? COUNTRIES[0];
  const [normalized, setNormalized] = useState("");
  const [channel, setChannel] = useState<Channel>(channels[0]);
  const [usedChannel, setUsedChannel] = useState<Channel>(channels[0]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [requireEmail, setRequireEmail] = useState(false);
  const trustedEmail = prefill?.email;
  const [devCode, setDevCode] = useState<string>();
  const [codeLength, setCodeLength] = useState(4);
  const [error, setError] = useState<string>();
  const [resendIn, setResendIn] = useState(0);
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
    const full = composePhone(country.dial, national);
    if (!full) return setError(errText("phone"));
    setChannel(ch);
    start(async () => {
      const r = await sendCodeAction(full, ch, locale);
      if (!r.ok) return setError(errText(r.error, "retryIn" in r ? r.retryIn : undefined));
      setNormalized(r.phone!);
      setUsedChannel(r.channel);
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
      const r = await verifyCodeAction(normalized, value, locale, trustedEmail);
      if (!r.ok) { verifying.current = ""; return setError(errText(r.error)); }
      if (r.needProfile) {
        setTicket(r.ticket || "");
        setRequireEmail(r.requireEmail);
        setStep("profile");
      } else onDone(r.role);
    });
  }

  if (!channels.length) return <p className="text-muted">{t("noChannels")}</p>;

  return (
    <div>
      {step === "phone" && (
        <div>
          <label className="label" htmlFor="phone">{t("phone")}</label>
          <div className="grid gap-2">
            <select className="input" aria-label={t("country")} value={iso} onChange={(e) => setIso(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c.iso} value={c.iso}>{flagEmoji(c.iso)} {c.name} +{c.dial}</option>
              ))}
            </select>
            <input id="phone" className="input text-lg tracking-wide" inputMode="tel" autoComplete="tel-national" value={national} placeholder={t("phonePlaceholder")} onChange={(e) => setNational(e.target.value)} />
          </div>
          <p className="mt-1 text-xs text-muted">{t("phoneHint")}</p>
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
          <p className="text-sm text-muted">{t("codeSent", { channel: t(`channel.${usedChannel}`), phone: formatPhone(normalized) })}</p>
          {usedChannel !== channel && <p className="mt-1 text-sm text-muted">{t("newNumberSms")}</p>}
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

      {step === "profile" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await completeSignupAction(ticket, name, requireEmail ? email : undefined);
              if (!r.ok) return setError(errText(r.error));
              onDone(r.role);
            });
          }}
        >
          <label className="label" htmlFor="name">{t("yourName")}</label>
          <input id="name" className="input" autoFocus value={name} placeholder={t("namePlaceholder")} onChange={(e) => setName(e.target.value)} />
          {requireEmail ? (
            <div className="mt-3">
              <label className="label" htmlFor="email">{t("email")}</label>
              <input id="email" type="email" className="input" autoComplete="email" value={email} placeholder={t("emailPlaceholder")} onChange={(e) => setEmail(e.target.value)} />
            </div>
          ) : (
            trustedEmail && <p className="mt-2 text-sm text-muted">{t("email")}: {trustedEmail}</p>
          )}
          <button className="btn-primary mt-3 w-full" disabled={pending || !name.trim() || (requireEmail && !email.trim())}>{tc("continue")}</button>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
    </div>
  );
}
