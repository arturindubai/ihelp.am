import { describe, it, expect, beforeEach, vi } from "vitest";
import { CLIENT_CACHE_KEY, PRO_CACHE_KEY, type VisitCacheData } from "./visitCache";

function makeLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
}

const SAMPLE_DATA: VisitCacheData = {
  cachedAt: "2026-09-30T10:00:00.000Z",
  visits: [
    {
      id: "visit-1",
      scheduledAt: "2026-10-01T08:00:00.000Z",
      durationMin: 120,
      status: "SCHEDULED",
      price: 8000,
      serviceTitle: { ru: "Уборка", en: "Cleaning", am: "Մաքրություն" },
      masterName: { ru: "Анна", en: "Anna", am: "Աննա" },
      masterPhoto: null,
    },
  ],
};

beforeEach(() => {
  const ls = makeLocalStorage();
  vi.stubGlobal("localStorage", ls);
});

describe("visitCache — кэш клиента", () => {
  it("readVisitCache возвращает null при пустом хранилище", async () => {
    const { readVisitCache } = await import("./visitCache");
    expect(readVisitCache(CLIENT_CACHE_KEY)).toBeNull();
  });

  it("writeVisitCache + readVisitCache: данные сохраняются и читаются", async () => {
    const { readVisitCache, writeVisitCache } = await import("./visitCache");
    writeVisitCache(CLIENT_CACHE_KEY, SAMPLE_DATA);
    expect(readVisitCache(CLIENT_CACHE_KEY)).toEqual(SAMPLE_DATA);
  });

  it("clearVisitCache удаляет запись", async () => {
    const { readVisitCache, writeVisitCache, clearVisitCache } = await import("./visitCache");
    writeVisitCache(CLIENT_CACHE_KEY, SAMPLE_DATA);
    clearVisitCache(CLIENT_CACHE_KEY);
    expect(readVisitCache(CLIENT_CACHE_KEY)).toBeNull();
  });

  it("readVisitCache возвращает null при невалидном JSON", async () => {
    const { readVisitCache } = await import("./visitCache");
    localStorage.setItem(CLIENT_CACHE_KEY, "{invalid json}");
    expect(readVisitCache(CLIENT_CACHE_KEY)).toBeNull();
  });

  it("readVisitCache возвращает null при неполной структуре", async () => {
    const { readVisitCache } = await import("./visitCache");
    localStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify({ cachedAt: "2026-09-30" }));
    expect(readVisitCache(CLIENT_CACHE_KEY)).toBeNull();
  });

  it("CLIENT_CACHE_KEY и PRO_CACHE_KEY — разные ключи", () => {
    expect(CLIENT_CACHE_KEY).not.toBe(PRO_CACHE_KEY);
  });

  it("кэш мастера и клиента хранятся независимо", async () => {
    const { readVisitCache, writeVisitCache } = await import("./visitCache");
    const proData: VisitCacheData = { cachedAt: "2026-09-30T11:00:00.000Z", visits: [] };
    writeVisitCache(CLIENT_CACHE_KEY, SAMPLE_DATA);
    writeVisitCache(PRO_CACHE_KEY, proData);
    expect(readVisitCache(CLIENT_CACHE_KEY)).toEqual(SAMPLE_DATA);
    expect(readVisitCache(PRO_CACHE_KEY)).toEqual(proData);
  });
});
