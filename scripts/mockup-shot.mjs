#!/usr/bin/env node
// Макет-картинка из HTML: дизайнер пишет экран по токенам темы в data/mockups/<КЛЮЧ>/имя.html,
// скрипт снимает его как телефон (390×844) и компьютер (1280×800) рядом с файлом: имя-phone.png, имя-desktop.png.
//   node scripts/mockup-shot.mjs data/mockups/DSN-3/card.html [ещё.html …]
// Затем: node scripts/cc.mjs attach DSN-3 --file data/mockups/DSN-3/card-phone.png --mockup
import fs from "node:fs";
import path from "node:path";
const find = (dir, test) => { try { for (const d of fs.readdirSync(dir)) { const p = test(path.join(dir, d)); if (p) return p; } } catch {} return null; };
const pw = find("/root/.npm/_npx", (d) => (fs.existsSync(`${d}/node_modules/playwright/index.mjs`) ? `${d}/node_modules/playwright/index.mjs` : null));
const chrome = find("/root/.cache/ms-playwright", (d) => (fs.existsSync(`${d}/chrome-linux64/chrome`) ? `${d}/chrome-linux64/chrome` : null));
const files = process.argv.slice(2).filter((f) => f.endsWith(".html"));
if (!files.length) { console.error("Укажите HTML-файлы макета: node scripts/mockup-shot.mjs data/mockups/КЛЮЧ/экран.html"); process.exit(2); }
if (!pw || !chrome) { console.error("Playwright или Chrome не найдены на сервере — скриншот макета невозможен"); process.exit(2); }
const { chromium } = await import(pw);
const browser = await chromium.launch({ executablePath: chrome });
for (const f of files) {
  const abs = path.resolve(f);
  if (!fs.existsSync(abs)) { console.error(`нет файла ${f}`); continue; }
  for (const [label, viewport, mobile] of [["phone", { width: 390, height: 844 }, true], ["desktop", { width: 1280, height: 800 }, false]]) {
    const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    const page = await ctx.newPage();
    await page.goto(`file://${abs}`, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(300);
    const out = abs.replace(/\.html$/, `-${label}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`✓ ${path.relative(process.cwd(), out)}`);
    await ctx.close();
  }
}
await browser.close();
