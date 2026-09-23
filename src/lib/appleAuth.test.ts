import { describe, expect, it } from "vitest";
import crypto from "crypto";
import { appleAuthUrl, buildAppleClientSecret, parseAppleIdToken } from "@/lib/appleAuth";

const idToken = (payload: object) => `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

describe("вход через Apple", () => {
  it("адрес авторизации требует form_post и содержит нужные поля", () => {
    const url = appleAuthUrl("com.ihelp.web", "https://ihelp.am/api/auth/apple/callback", "state123");
    expect(url).toContain("response_mode=form_post");
    expect(url).toContain("client_id=com.ihelp.web");
    expect(url).toContain("state=state123");
  });

  it("клиентский секрет — JWT ES256 с проверяемой подписью", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const secret = buildAppleClientSecret("TEAM123", "KEY123", "com.ihelp.web", privateKey as string);
    const [h, p, sig] = secret.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toMatchObject({ alg: "ES256", kid: "KEY123" });
    expect(JSON.parse(Buffer.from(p, "base64url").toString())).toMatchObject({ iss: "TEAM123", sub: "com.ihelp.web" });
    const ok = crypto.verify("sha256", Buffer.from(`${h}.${p}`), { key: publicKey as string, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"));
    expect(ok).toBe(true);
  });

  it("email приводится к нижнему регистру, email_verified строкой тоже засчитывается", () => {
    expect(parseAppleIdToken(idToken({ email: "Owner@Example.COM", email_verified: "true" }))).toEqual({ email: "owner@example.com", emailVerified: true });
    expect(parseAppleIdToken(idToken({ email: "a@b.am", email_verified: false }))?.emailVerified).toBe(false);
    expect(parseAppleIdToken(idToken({ sub: "123" }))).toBeNull();
    expect(parseAppleIdToken("мусор")).toBeNull();
  });
});
