import "server-only";
import { db } from "../db";
import { audit } from "../audit";
import { getSettings, saveSettingsSection, type Settings } from "../settings";
import { KEYS, cleanKeyValue, isTelegramBotToken, keyDef } from "@/lib/keys";
import { formatPhone } from "@/lib/phone";

/**
 * Ключи сервисов — Control Center → «Ключи» (как Secrets в админке LIA). Значения только записываются:
 * никогда не отдаются в браузер и не пишутся в журнал. Хранятся в настройках зашифрованными
 * (SETTINGS_ENCRYPTION_KEY из .env) и попадают в ночной бэкап базы. Каждая смена — строка журнала без значения
 */

type AnyObj = Record<string, unknown>;

function readPath(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, p) => (o && typeof o === "object" ? (o as AnyObj)[p] : undefined), root);
}

async function writePath(path: string, value: string) {
  const s = await getSettings();
  const [root, ...rest] = path.split(".") as [keyof Settings, ...string[]];
  const section = structuredClone(s[root]) as unknown as AnyObj;
  let node = section;
  for (const p of rest.slice(0, -1)) node = node[p] as AnyObj;
  node[rest[rest.length - 1]] = value;
  await saveSettingsSection(root, section as unknown as Settings[typeof root]);
}

export async function keysOverview() {
  const [s, logs] = await Promise.all([
    getSettings(),
    db.auditLog.findMany({ where: { entity: "Key" }, orderBy: { createdAt: "desc" }, take: 300, include: { user: { select: { name: true, phone: true } } } }),
  ]);
  return KEYS.map((k) => {
    const v = readPath(s, k.path);
    const last = logs.find((l) => l.entityId === k.path);
    return {
      ...k,
      present: typeof v === "string" && v.length > 0,
      changedAt: last?.createdAt ?? null,
      changedBy: last ? last.user?.name || (last.user?.phone ? formatPhone(last.user.phone) : "—") : null,
      lastAction: last?.action ?? null,
    };
  });
}

export type KeyRow = Awaited<ReturnType<typeof keysOverview>>[number];

export class KeyError extends Error {}

/** Задать или заменить ключ. Формат проверяется до записи: не тот токен — ошибка, прежний ключ остаётся */
export async function setKey(path: string, raw: string, userId: string) {
  const def = keyDef(path);
  if (!def) throw new KeyError("unknown_key");
  const value = cleanKeyValue(path, raw);
  if (!value) throw new KeyError("bad_value");
  if (def.check === "telegram" && !isTelegramBotToken(value)) throw new KeyError("bad_format");
  await writePath(path, value);
  await audit(userId, "key.set", "Key", path);
  console.log(`[keys] ключ ${path} изменён`);
}

export async function clearKey(path: string, userId: string) {
  if (!keyDef(path)) throw new KeyError("unknown_key");
  await writePath(path, "");
  await audit(userId, "key.clear", "Key", path);
  console.log(`[keys] ключ ${path} очищен`);
}

export type KeyCheckResult = { ok: boolean | null; detail: string };

/** Живая проверка ключа запросом к сервису. Ответ сервиса в браузер не уходит — только итог словами */
export async function checkKey(path: string): Promise<KeyCheckResult> {
  const def = keyDef(path);
  if (!def) throw new KeyError("unknown_key");
  const value = readPath(await getSettings(), path);
  if (typeof value !== "string" || !value) return { ok: false, detail: "empty" };
  try {
    if (def.check === "telegram") {
      const r = await fetch(`https://api.telegram.org/bot${value}/getMe`, { signal: AbortSignal.timeout(8000) });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; result?: { username?: string } } | null;
      return j?.ok ? { ok: true, detail: `@${j.result?.username ?? "?"}` } : { ok: false, detail: "rejected" };
    }
    if (def.check === "resend") {
      const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${value}` }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return { ok: false, detail: "rejected" };
      const j = (await r.json().catch(() => null)) as { data?: { status?: string }[] } | null;
      const all = j?.data ?? [];
      return { ok: true, detail: `domains:${all.length}:${all.filter((d) => d.status === "verified").length}` };
    }
    return { ok: null, detail: "no_check" };
  } catch {
    return { ok: false, detail: "unreachable" };
  }
}
