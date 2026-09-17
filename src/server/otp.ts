import "server-only";
import crypto from "crypto";
import { db } from "./db";
import { hash } from "./auth";
import { getSettings, Settings } from "./settings";
import type { OtpChannel } from "@prisma/client";

export type OtpResult = { ok: true; devCode?: string; resendIn: number; codeLength: number } | { ok: false; error: string; retryIn?: number };

export async function availableChannels(s?: Settings): Promise<OtpChannel[]> {
  const st = s || (await getSettings());
  const list: OtpChannel[] = [];
  if (st.otp.whatsapp.enabled) list.push("WHATSAPP");
  if (st.otp.telegram.enabled) list.push("TELEGRAM");
  if (st.otp.sms.enabled) list.push("SMS");
  // Пока ни один канал не подключён: код пишется в лог сервера (docker compose logs app | grep otp),
  // а при OTP_DEV_MODE=true ещё и показывается на экране. Так владелец может войти и настроить каналы.
  if (!list.length) return ["WHATSAPP", "TELEGRAM", "SMS"];
  return list;
}

export async function sendOtp(phone: string, channel: OtpChannel, ip?: string): Promise<OtpResult> {
  const s = await getSettings();
  const channels = await availableChannels(s);
  if (!channels.includes(channel)) return { ok: false, error: "channel_unavailable" };

  const last = await db.otpCode.findFirst({ where: { phone }, orderBy: { createdAt: "desc" } });
  if (last) {
    const wait = s.otp.resendSec - Math.floor((Date.now() - last.createdAt.getTime()) / 1000);
    if (wait > 0) return { ok: false, error: "too_soon", retryIn: wait };
  }
  const hourCount = await db.otpCode.count({ where: { phone, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
  if (hourCount >= 5) return { ok: false, error: "too_many" };
  if (ip) {
    const ipCount = await db.otpCode.count({ where: { ip, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
    if (ipCount >= 20) return { ok: false, error: "too_many" };
  }

  const code = crypto.randomInt(0, 10 ** s.otp.codeLength).toString().padStart(s.otp.codeLength, "0");
  await db.otpCode.create({
    data: { phone, channel, codeHash: hash(`${phone}:${code}`), expiresAt: new Date(Date.now() + s.otp.ttlMin * 60_000), ip },
  });

  const dev = process.env.OTP_DEV_MODE === "true";
  const configured = channel === "SMS" ? s.otp.sms.enabled : channel === "WHATSAPP" ? s.otp.whatsapp.enabled : s.otp.telegram.enabled;
  if (configured) {
    try {
      await deliver(s, channel, phone, code);
    } catch (e) {
      console.error("[otp] delivery failed", channel, e);
      if (!dev) return { ok: false, error: "delivery_failed" };
    }
  } else {
    console.log(`[otp:dev] ${channel} ${phone} → ${code}`);
  }
  return { ok: true, devCode: dev ? code : undefined, resendIn: s.otp.resendSec, codeLength: s.otp.codeLength };
}

export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  const s = await getSettings();
  const rec = await db.otpCode.findFirst({ where: { phone, consumedAt: null }, orderBy: { createdAt: "desc" } });
  if (!rec || rec.expiresAt < new Date() || rec.attempts >= s.otp.maxAttempts) return false;
  const ok = crypto.timingSafeEqual(Buffer.from(rec.codeHash), Buffer.from(hash(`${phone}:${code.trim()}`)));
  await db.otpCode.update({ where: { id: rec.id }, data: ok ? { consumedAt: new Date() } : { attempts: { increment: 1 } } });
  return ok;
}

async function deliver(s: Settings, channel: OtpChannel, phone: string, code: string) {
  if (channel === "TELEGRAM") {
    // Telegram Gateway API — https://core.telegram.org/gateway/api
    const r = await fetch("https://gatewayapi.telegram.org/sendVerificationMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${s.otp.telegram.gatewayToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ phone_number: phone, code, ttl: s.otp.ttlMin * 60 }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(JSON.stringify(j));
    return;
  }
  if (channel === "WHATSAPP") {
    // WhatsApp Cloud API, шаблон категории AUTHENTICATION
    const w = s.otp.whatsapp;
    const r = await fetch(`https://graph.facebook.com/v21.0/${w.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${w.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone.replace("+", ""),
        type: "template",
        template: {
          name: w.templateName,
          language: { code: w.templateLang },
          components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
          ],
        },
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    return;
  }
  // SMS через Twilio (можно заменить на местного SMS-провайдера)
  const t = s.otp.sms;
  const body = new URLSearchParams({ To: phone, From: t.from, Body: `Код: ${code}` });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${t.accountSid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${t.accountSid}:${t.authToken}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(await r.text());
}
