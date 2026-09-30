#!/usr/bin/env node
/** Скриншоты редактора услуги: находит первую услугу в каталоге и снимает редактор. */
import fs from "node:fs";
import path from "node:path";

const here = process.cwd();
const root = fs.existsSync(path.join(here, "package.json")) ? here : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const common = (await import("node:child_process")).execFileSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
const name = `ihelp-stand-${path.basename(root).toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
const infoPath = path.join(common, "cc", "stands", `${name}.json`);
if (!fs.existsSync(infoPath)) { console.error("✗ Стенд не запущен"); process.exit(1); }
const { port, token } = JSON.parse(fs.readFileSync(infoPath, "utf8"));
const base = `http://127.0.0.1:${port}`;
const out = path.join(common, "cc", "shots", name);
fs.mkdirSync(out, { recursive: true });

const pw = (() => { try { for (const d of fs.readdirSync("/root/.npm/_npx")) { const p = `/root/.npm/_npx/${d}/node_modules/playwright/index.mjs`; if (fs.existsSync(p)) return p; } } catch {} })();
const chrome = (() => { try { for (const d of fs.readdirSync("/root/.cache/ms-playwright")) { const p = `/root/.cache/ms-playwright/${d}/chrome-linux64/chrome`; if (fs.existsSync(p)) return p; } } catch {} })();
if (!pw || !chrome) { console.error("✗ Playwright или Chromium не найдены"); process.exit(1); }

const { chromium } = await import(pw);
const browser = await chromium.launch({ executablePath: chrome });

for (const [label, vp, mobile] of [["desktop-1440", { width: 1440, height: 900 }, false], ["mobile-360", { width: 360, height: 800 }, true]]) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("response", (r) => r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));

  await page.goto(`${base}/api/auth/link?token=${token}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.goto(`${base}/ru/admin/services`, { waitUntil: "networkidle", timeout: 120000 });

  // Находим ссылку на редактор первой услуги (иконка карандаша)
  const editHref = await page.evaluate(() => {
    const links = [...document.querySelectorAll("a[href*='/admin/services/']")];
    return links[0]?.getAttribute("href") ?? null;
  });

  if (!editHref) { console.log(`${label}: ссылка на редактор не найдена`); await ctx.close(); continue; }
  await page.goto(`${base}${editHref}`, { waitUntil: "networkidle", timeout: 120000 });

  const file1 = path.join(out, `${label}_editor_main.png`);
  await page.screenshot({ path: file1, fullPage: false });
  console.log(`${label} editor-main → ${file1}`);

  // Скролл вниз для блока мастеров
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(300);
  const file2 = path.join(out, `${label}_editor_masters.png`);
  await page.screenshot({ path: file2, fullPage: false });
  console.log(`${label} editor-masters → ${file2}`);

  if (errors.length) console.log(`Ошибки (${label}): ${errors.slice(0, 4).join(" | ")}`);
  await ctx.close();
}
await browser.close();
