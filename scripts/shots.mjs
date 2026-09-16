// node scripts/shots.mjs <sid> <width> <out-prefix> path1 path2 ...
import { chromium } from "@playwright/test";
const [,, sid, width, prefix, ...paths] = process.argv;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const mobile = Number(width) < 800;
const ctx = await b.newContext({ viewport: { width: Number(width), height: mobile ? 844 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
if (sid !== "-") await ctx.addCookies([{ name: "sid", value: sid, url: "http://localhost:3000" }]);
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message));
let i = 0;
for (const path of paths) {
  await p.goto("http://localhost:3000" + path, { waitUntil: "networkidle" });
  await p.screenshot({ path: `${prefix}-${String(i++).padStart(2, "0")}.png`, fullPage: true });
}
await b.close();
