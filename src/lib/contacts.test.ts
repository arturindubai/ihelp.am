import { describe, expect, it } from "vitest";
import { contactLink, contactLinks, contactTitle, fillContacts } from "./contacts";

describe("contacts", () => {
  it("phone and whatsapp", () => {
    expect(contactLink({ phone: "+374 41 014713" }, "phone")).toEqual({ key: "phone", href: "tel:+37441014713", label: "+374 41 014 713" });
    expect(contactLink({ whatsapp: "041014713" }, "whatsapp")?.href).toBe("https://wa.me/37441014713");
  });

  it("telegram and instagram accept @name, name and URL", () => {
    expect(contactLink({ telegram: "@homecare" }, "telegram")?.href).toBe("https://t.me/homecare");
    expect(contactLink({ telegram: "https://t.me/homecare" }, "telegram")?.label).toBe("@homecare");
    expect(contactLink({ instagram: "https://www.instagram.com/homecare/" }, "instagram")?.href).toBe("https://instagram.com/homecare");
  });

  it("titles distinguish channels with the same number", () => {
    const links = contactLinks({ phone: "+37441014713", whatsapp: "+37441014713", email: "a@b.am" });
    expect(links.map(contactTitle)).toEqual(["+374 41 014 713", "WhatsApp +374 41 014 713", "a@b.am"]);
  });

  it("skips empty values and keeps order", () => {
    expect(contactLinks({ email: "a@b.am", phone: "", telegram: " " }).map((x) => x.key)).toEqual(["email"]);
  });

  it("fills placeholders in page texts", () => {
    expect(fillContacts("{{name}}: {{ phone }}, {{email}}, {{unknown}}", { name: "HomeCare", phone: "+37441014713", email: "a@b.am" })).toBe("HomeCare: +374 41 014 713, a@b.am, {{unknown}}");
  });
});
