import "server-only";
import { getSettings } from "../settings";
import { alertTech } from "../alerts";
import { html } from "../notify";

export { mailTemplate } from "@/lib/mail-template";

/**
 * Отправка писем через Resend (https://resend.com).
 * Включается в Админка → Настройки → Почта: ключ API и адрес отправителя.
 * Домен отправителя должен быть подтверждён в кабинете Resend (записи SPF и DKIM),
 * иначе письма не уйдут или попадут в спам.
 */
const API = "https://api.resend.com/emails";

export type MailResult = { ok: true; id?: string } | { ok: false; error: string };

export async function sendMail(input: { to: string; subject: string; html: string; text?: string }): Promise<MailResult> {
  const s = await getSettings();
  const { enabled, apiKey, from, replyTo } = s.mail;
  if (!enabled || !apiKey || !from) {
    console.log("[mail] не настроена, письмо не отправлено:", input.subject, "→", input.to);
    return { ok: false, error: "not_configured" };
  }
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!r.ok) {
      const error = body.message || `http_${r.status}`;
      console.error("[mail] ошибка отправки", r.status, error);
      await alertTech("mail-failed", html`❌ <b>Письмо не отправлено</b>\n${input.subject} → ${input.to}\n<code>${error}</code>`, 30);
      return { ok: false, error };
    }
    return { ok: true, id: body.id };
  } catch (e) {
    const error = (e as Error).message;
    console.error("[mail] сбой отправки", e);
    await alertTech("mail-failed", html`❌ <b>Письмо не отправлено</b>\n${input.subject} → ${input.to}\n<code>${error}</code>`, 30);
    return { ok: false, error };
  }
}
