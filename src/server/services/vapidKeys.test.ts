import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();

vi.mock("../db", () => ({
  db: {
    setting: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}));

const mockAlertTech = vi.fn();
vi.mock("../alerts", () => ({
  alertTech: (...args: unknown[]) => mockAlertTech(...args),
}));

vi.mock("../notify", () => ({
  html: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, s, i) => acc + s + (values[i] ?? ""), ""),
}));

const mockEncrypt = vi.fn((v: string) => `enc:${v}`);
const mockDecrypt = vi.fn((v: string) => v.replace(/^enc:/, ""));
const mockIsEncrypted = vi.fn((v: string) => v.startsWith("enc:"));

vi.mock("@/lib/crypto", () => ({
  encrypt: (...args: unknown[]) => mockEncrypt(...args as [string]),
  decrypt: (...args: unknown[]) => mockDecrypt(...args as [string]),
  isEncrypted: (...args: unknown[]) => mockIsEncrypted(...args as [string]),
}));

beforeEach(() => {
  vi.resetModules();
  mockFindUnique.mockReset();
  mockUpsert.mockReset().mockResolvedValue({});
  mockAlertTech.mockReset().mockResolvedValue(undefined);
  mockEncrypt.mockImplementation((v: string) => `enc:${v}`);
  mockDecrypt.mockImplementation((v: string) => v.replace(/^enc:/, ""));
  mockIsEncrypted.mockImplementation((v: string) => v.startsWith("enc:"));
  delete process.env.SETTINGS_ENCRYPTION_KEY;
});

async function importFresh() {
  const m = await import("./vapidKeys");
  return m;
}

describe("getOrCreateVapidKeys — п.4: без ключа шифрования", () => {
  it("бросает исключение если SETTINGS_ENCRYPTION_KEY не задан", async () => {
    const { getOrCreateVapidKeys } = await importFresh();
    await expect(getOrCreateVapidKeys()).rejects.toThrow("SETTINGS_ENCRYPTION_KEY not set");
  });

  it("не создаёт запись в базе если SETTINGS_ENCRYPTION_KEY не задан", async () => {
    const { getOrCreateVapidKeys } = await importFresh();
    await getOrCreateVapidKeys().catch(() => null);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("getOrCreateVapidKeys — п.3: ошибка расшифровки", () => {
  it("бросает исключение если расшифровка закрытого ключа не удалась", async () => {
    process.env.SETTINGS_ENCRYPTION_KEY = "test-enc-key";
    mockFindUnique.mockResolvedValue({
      key: "_vapid",
      value: { publicKey: "pub", privateKey: "enc:broken", createdAt: "2026-01-01" },
    });
    mockDecrypt.mockImplementationOnce(() => { throw new Error("bad key"); });
    const { getOrCreateVapidKeys } = await importFresh();
    await expect(getOrCreateVapidKeys()).rejects.toThrow("decryption failed");
  });

  it("отправляет тех-алерт при ошибке расшифровки", async () => {
    process.env.SETTINGS_ENCRYPTION_KEY = "test-enc-key";
    mockFindUnique.mockResolvedValue({
      key: "_vapid",
      value: { publicKey: "pub", privateKey: "enc:broken", createdAt: "2026-01-01" },
    });
    mockDecrypt.mockImplementationOnce(() => { throw new Error("bad key"); });
    const { getOrCreateVapidKeys } = await importFresh();
    await getOrCreateVapidKeys().catch(() => null);
    expect(mockAlertTech).toHaveBeenCalledOnce();
    expect(mockAlertTech.mock.calls[0][0]).toBe("vapid-decrypt-error");
  });

  it("не создаёт новую пару при ошибке расшифровки", async () => {
    process.env.SETTINGS_ENCRYPTION_KEY = "test-enc-key";
    mockFindUnique.mockResolvedValue({
      key: "_vapid",
      value: { publicKey: "pub", privateKey: "enc:broken", createdAt: "2026-01-01" },
    });
    mockDecrypt.mockImplementationOnce(() => { throw new Error("bad key"); });
    const { getOrCreateVapidKeys } = await importFresh();
    await getOrCreateVapidKeys().catch(() => null);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("getOrCreateVapidKeys — генерация новой пары", () => {
  it("генерирует пару при первом обращении и сохраняет зашифрованной", async () => {
    process.env.SETTINGS_ENCRYPTION_KEY = "test-enc-key";
    mockFindUnique.mockResolvedValue(null);
    const { getOrCreateVapidKeys } = await importFresh();
    const result = await getOrCreateVapidKeys();
    expect(result.publicKey).toBeTruthy();
    expect(result.privateKey).toBeTruthy();
    expect(mockUpsert).toHaveBeenCalledOnce();
    const saved = mockUpsert.mock.calls[0][0].create.value;
    expect(saved.privateKey).toMatch(/^enc:/);
  });
});

describe("getVapidStatus — п.4: нет ключа шифрования", () => {
  it("возвращает noEncKey=true если SETTINGS_ENCRYPTION_KEY не задан", async () => {
    const { getVapidStatus } = await importFresh();
    const status = await getVapidStatus();
    expect(status.noEncKey).toBe(true);
    expect(status.present).toBe(false);
  });

  it("не обращается к базе если SETTINGS_ENCRYPTION_KEY не задан", async () => {
    const { getVapidStatus } = await importFresh();
    await getVapidStatus();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});
