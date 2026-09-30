// Кэш визитов в localStorage: чтение/запись для офлайн-страниц.
// Не использует серверные API — только браузерный localStorage.

export const CLIENT_CACHE_KEY = "ihelp-visits-client";
export const PRO_CACHE_KEY = "ihelp-visits-pro";

export type CachedVisit = {
  id: string;
  scheduledAt: string | null;
  durationMin: number;
  status: string;
  price: number;
  serviceTitle: Record<string, string> | string;
  masterName: Record<string, string> | string | null;
  masterPhoto: string | null;
  // для кабинета мастера
  clientName?: string | null;
  clientPhone?: string | null;
  address?: string | null;
};

export type VisitCacheData = {
  cachedAt: string;
  visits: CachedVisit[];
};

export function readVisitCache(key: string): VisitCacheData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    if (!("cachedAt" in parsed) || !("visits" in parsed)) return null;
    return parsed as VisitCacheData;
  } catch {
    return null;
  }
}

export function writeVisitCache(key: string, data: VisitCacheData): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // приватный режим или нет места — игнорируем
  }
}

export function clearVisitCache(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {}
}
