import "server-only";
import { headers } from "next/headers";

/**
 * Страна посетителя по IP — только чтобы подобрать код страны в форме телефона по умолчанию (AUTH-12).
 * Бесплатный сервис без ключа (ipwho.is). Любая ошибка или частный адрес — null, форма остаётся с
 * Арменией по умолчанию. IP наружу уходит только этому сервису и нигде у нас не сохраняется.
 */
const cache = new Map<string, { iso: string | null; at: number }>();
const OK_TTL = 6 * 3600_000;
const FAIL_TTL = 2 * 60_000;
const PRIVATE = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i;

export async function detectCountry(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "";
  // заголовок задаёт клиент: в адрес подставляем только то, что похоже на IPv4/IPv6
  if (!ip || ip.length > 45 || !/^[0-9a-fA-F:.]+$/.test(ip) || PRIVATE.test(ip)) return null;

  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < (hit.iso ? OK_TTL : FAIL_TTL)) return hit.iso;

  let iso: string | null = null;
  try {
    const r = await fetch(`https://ipwho.is/${ip}?fields=success,country_code`, { signal: AbortSignal.timeout(1200), cache: "no-store" });
    const j = (await r.json()) as { success?: boolean; country_code?: string };
    if (j.success && /^[A-Z]{2}$/.test(j.country_code ?? "")) iso = j.country_code as string;
  } catch {
    // не критично: останется страна по умолчанию
  }
  if (cache.size > 2000) cache.clear();
  cache.set(ip, { iso, at: Date.now() });
  return iso;
}
