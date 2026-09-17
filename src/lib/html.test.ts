import { describe, expect, it } from "vitest";
import { escapeHtml, html } from "./html";

describe("telegram html", () => {
  it("escapes interpolated values only", () => {
    expect(html`<b>Заказ №${42}</b>\n👤 ${"Anna & <Co>"}`).toBe("<b>Заказ №42</b>\n👤 Anna &amp; &lt;Co&gt;");
  });

  it("neutralizes links injected via user fields", () => {
    expect(html`${'<a href="https://evil.example">клик</a>'}`).not.toContain("<a");
  });

  it("handles empty values", () => {
    expect(html`a${null}b${undefined}c`).toBe("abc");
    expect(escapeHtml("")).toBe("");
  });
});
