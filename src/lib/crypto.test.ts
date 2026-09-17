import { describe, expect, it } from "vitest";
import { decrypt, encrypt, isEncrypted } from "./crypto";

const KEY = "a".repeat(64);
const OTHER = "b".repeat(64);

describe("secrets encryption", () => {
  it("roundtrip", () => {
    const v = encrypt("EAAG-secret-token", KEY);
    expect(isEncrypted(v)).toBe(true);
    expect(v).not.toContain("secret");
    expect(decrypt(v, KEY)).toBe("EAAG-secret-token");
  });

  it("random iv: same secret encrypts differently", () => {
    expect(encrypt("x", KEY)).not.toBe(encrypt("x", KEY));
  });

  it("wrong key or tampered data fails", () => {
    const v = encrypt("secret", KEY);
    expect(() => decrypt(v, OTHER)).toThrow();
    const parts = v.split(":");
    parts[4] = Buffer.from("tampered").toString("base64");
    expect(() => decrypt(parts.join(":"), KEY)).toThrow();
  });

  it("plain values pass through (legacy, not encrypted)", () => {
    expect(decrypt("plain-token", KEY)).toBe("plain-token");
  });

  it("rejects malformed key", () => {
    expect(() => encrypt("x", "abc")).toThrow();
  });
});
