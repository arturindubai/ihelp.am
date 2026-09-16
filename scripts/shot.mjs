// node scripts/shot.mjs <path> <out.png> [fullPage=1] [cookie]
import { chromium } from "@playwright/test";
const [,, path, out, full = "1", cookie] = process.argv;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
if (cookie) await ctx.addCookies([{ name: "sid", value: cookie, url: "http://localhost:3000" }]);
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:3000" + path, { waitUntil: "networkidle" });
await p.screenshot({ path: out, fullPage: full === "1" });
await b.close();
