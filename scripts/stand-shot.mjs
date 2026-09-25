#!/usr/bin/env node
/**
 * Скриншоты стенда текущей рабочей копии (scripts/stand.sh up): вход владельцем по ссылке стенда,
 * затем каждая страница — на компьютере и на телефоне. Ошибки страниц печатаются.
 *   node scripts/stand-shot.mjs /ru /ru/admin/control …   → .git/cc/shots/<стенд>/*.png
 * Смотреть картинки — инструментом Read по напечатанным путям.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Корень — текущая папка, если это рабочая копия: тот же выбор, что у scripts/stand.sh
const here = process.cwd();
const root = fs.existsSync(path.join(here, "package.json")) && fs.existsSync(path.join(here, "prisma")) ? here : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const common = execFileSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
const name = `ihelp-stand-${path.basename(root).toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
const infoPath = path.join(common, "cc", "stands", `${name}.json`);
if (!fs.existsSync(infoPath)) {
  console.error("✗ Стенда нет: scripts/stand.sh up");
  process.exit(1);
}
const { port, token } = JSON.parse(fs.readFileSync(infoPath, "utf8"));
const pages = process.argv.slice(2);
if (!pages.length) {
  console.error("Укажите страницы: node scripts/stand-shot.mjs /ru /ru/admin/control");
  process.exit(1);
}

// Playwright и Chromium уже есть на сервере — ищем, а не ставим
const find = (dir, test) => {
  try {
    for (const d of fs.readdirSync(dir)) {
      const p = test(path.join(dir, d));
      if (p) return p;
    }
  } catch {}
  return null;
};
const pw = find("/root/.npm/_npx", (d) => (fs.existsSync(`${d}/node_modules/playwright/index.mjs`) ? `${d}/node_modules/playwright/index.mjs` : null));
const chrome = find("/root/.cache/ms-playwright", (d) => (fs.existsSync(`${d}/chrome-linux64/chrome`) ? `${d}/chrome-linux64/chrome` : null));
if (!pw || !chrome) {
  console.error("✗ Не нашёл Playwright или Chromium на сервере");
  process.exit(1);
}
const { chromium } = await import(pw);
const out = path.join(common, "cc", "shots", name);
fs.mkdirSync(out, { recursive: true });
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ executablePath: chrome });
for (const [label, viewport, mobile] of [
  ["desktop", { width: 1440, height: 1000 }, false],
  ["mobile", { width: 390, height: 844 }, true],
]) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("response", (r) => r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(`${base}/api/auth/link?token=${token}`, { waitUntil: "networkidle", timeout: 180000 });
  for (const p of pages) {
    const res = await page.goto(base + p, { waitUntil: "networkidle", timeout: 180000 });
    const file = path.join(out, `${label}${p.replace(/[^a-zA-Z0-9]+/g, "_")}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`${res?.status() ?? "?"} ${label} ${p} → ${file}`);
  }
  if (errors.length) console.log(`Ошибки (${label}): ${errors.slice(0, 8).join(" | ")}`);
  await ctx.close();
}
await browser.close();
