#!/usr/bin/env node
// Временный скрипт для визуального теста COMP-34: включает showFormats на категории cleaning
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const common = execFileSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
const name = `ihelp-stand-${path.basename(root).toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
const infoPath = path.join(common, "cc", "stands", `${name}.json`);
if (!fs.existsSync(infoPath)) { console.error("Стенд не запущен"); process.exit(1); }
const { port, token } = JSON.parse(fs.readFileSync(infoPath, "utf8"));
const base = `http://127.0.0.1:${port}`;

const find = (dir, test) => {
  try { for (const d of fs.readdirSync(dir)) { const p = test(path.join(dir, d)); if (p) return p; } } catch {}
  return null;
};
const pw = find("/root/.npm/_npx", (d) => fs.existsSync(`${d}/node_modules/playwright/index.mjs`) ? `${d}/node_modules/playwright/index.mjs` : null);
const chrome = find("/root/.cache/ms-playwright", (d) => fs.existsSync(`${d}/chrome-linux64/chrome`) ? `${d}/chrome-linux64/chrome` : null);
if (!pw || !chrome) { console.error("Playwright или Chromium не найден"); process.exit(1); }
const { chromium } = await import(pw);

const out = path.join(common, "cc", "shots", name);
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: chrome });

// Включить showFormats через admin
const ctx1 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p1 = await ctx1.newPage();
await p1.goto(`${base}/api/auth/link?token=${token}`, { waitUntil: "networkidle", timeout: 60000 });
await p1.goto(`${base}/ru/admin/services`, { waitUntil: "networkidle", timeout: 60000 });

// Найти и кликнуть карандаш редактирования первой категории (Уборка)
const editBtn = p1.locator("section.card").first().locator("button.btn-ghost").first();
await editBtn.click();
await p1.waitForTimeout(800);

// Скриншот Sheet с формой
await p1.screenshot({ path: path.join(out, "admin_category_edit.png"), fullPage: false });
console.log(`Sheet: ${path.join(out, "admin_category_edit.png")}`);

// Найти все switch-кнопки в Sheet и включить последний (showFormats)
const switches = p1.locator("[role='switch']");
const cnt = await switches.count();
console.log(`Переключателей в Sheet: ${cnt}`);
for (let i = 0; i < cnt; i++) {
  const s = switches.nth(i);
  const checked = await s.getAttribute("aria-checked");
  const label = await s.locator("..").textContent();
  console.log(`  [${i}] checked=${checked} label="${label?.trim().slice(0, 60)}"`);
}

// Последний switch — showFormats (если не включён, включаем)
if (cnt > 0) {
  const last = switches.nth(cnt - 1);
  const isChecked = await last.getAttribute("aria-checked");
  if (isChecked !== "true") {
    await last.click();
    console.log("showFormats включён");
    await p1.waitForTimeout(300);
  }

  // Сохранить
  const saveBtn = p1.locator("button.btn-primary").last();
  await saveBtn.click();
  await p1.waitForTimeout(1000);
  console.log("Сохранено");
}

await ctx1.close();

// Скриншоты страницы категории — desktop и mobile
for (const [label, viewport, mobile] of [
  ["desktop", { width: 1440, height: 900 }, false],
  ["mobile", { width: 390, height: 844 }, true],
]) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  await page.goto(`${base}/api/auth/link?token=${token}`, { waitUntil: "networkidle", timeout: 60000 });
  const res = await page.goto(`${base}/ru/c/cleaning`, { waitUntil: "networkidle", timeout: 60000 });
  const file = path.join(out, `${label}_formats_cleaning.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`${res?.status()} ${label} /ru/c/cleaning → ${file}`);
  await ctx.close();
}

await browser.close();
