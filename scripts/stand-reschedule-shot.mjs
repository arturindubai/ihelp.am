#!/usr/bin/env node
/**
 * FLOW-7: скриншот листа «Перенести визит» с выбором мастера.
 * Входит как владелец, открывает первый заказ, нажимает «Перенести» и снимает Sheet.
 *   node scripts/stand-reschedule-shot.mjs
 * Картинки → .git/cc/shots/<стенд>/
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const here = process.cwd();
const root =
  fs.existsSync(path.join(here, "package.json")) && fs.existsSync(path.join(here, "prisma"))
    ? here
    : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const common = execFileSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
const name = `ihelp-stand-${path.basename(root).toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
const infoPath = path.join(common, "cc", "stands", `${name}.json`);
if (!fs.existsSync(infoPath)) { console.error("✗ Стенда нет: scripts/stand.sh up"); process.exit(1); }
const { port, token } = JSON.parse(fs.readFileSync(infoPath, "utf8"));

const find = (dir, test) => {
  try { for (const d of fs.readdirSync(dir)) { const p = test(path.join(dir, d)); if (p) return p; } } catch {}
  return null;
};
const pw = find("/root/.npm/_npx", (d) =>
  fs.existsSync(`${d}/node_modules/playwright/index.mjs`) ? `${d}/node_modules/playwright/index.mjs` : null
);
const chrome = find("/root/.cache/ms-playwright", (d) =>
  fs.existsSync(`${d}/chrome-linux64/chrome`) ? `${d}/chrome-linux64/chrome` : null
);
if (!pw || !chrome) { console.error("✗ Playwright или Chromium не найдены"); process.exit(1); }
const { chromium } = await import(pw);
const out = path.join(common, "cc", "shots", name);
fs.mkdirSync(out, { recursive: true });
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({ executablePath: chrome });

async function shot(page, label, suffix) {
  const file = path.join(out, `${label}_${suffix}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  → ${file}`);
  return file;
}

for (const [label, viewport, mobile] of [
  ["desktop", { width: 1440, height: 900 }, false],
  ["mobile", { width: 390, height: 844 }, true],
]) {
  console.log(`\n▶ ${label}`);
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const errors = [];
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("response", (r) => r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));

  // Вход как владелец
  await page.goto(`${base}/api/auth/link?token=${token}`, { waitUntil: "networkidle", timeout: 120000 });

  // Список заказов
  await page.goto(`${base}/ru/account/orders`, { waitUntil: "networkidle", timeout: 120000 });
  await shot(page, label, "01_orders_list");

  // Первый заказ
  const orderLink = page.locator("a[href*='/account/orders/']").first();
  const href = await orderLink.getAttribute("href").catch(() => null);
  if (!href) {
    console.log("  ✗ Ссылка на заказ не найдена");
    await ctx.close();
    continue;
  }
  await page.goto(base + href, { waitUntil: "networkidle", timeout: 120000 });
  await shot(page, label, "02_order_page");

  // Нажимаем «Перенести» / «Запланировать»
  const rescheduleBtn = page.getByRole("button", { name: /Перенести|Запланировать/i }).first();
  const btnVisible = await rescheduleBtn.isVisible().catch(() => false);
  if (!btnVisible) {
    console.log("  ✗ Кнопка «Перенести» не найдена");
    await ctx.close();
    continue;
  }
  await rescheduleBtn.click();

  // Ждём появления Sheet
  await page.waitForTimeout(2000);
  await shot(page, label, "03_reschedule_sheet_open");

  // Если есть чипы мастеров — делаем скриншот с выбором конкретного мастера
  const chips = page.locator("button").filter({ hasText: /Анна|Anna/ });
  const hasChips = await chips.count().then((n) => n > 0).catch(() => false);
  if (hasChips) {
    await chips.first().click();
    await page.waitForTimeout(800);
    await shot(page, label, "04_sheet_master_anna_selected");
  }

  if (errors.length) console.log(`  Ошибки: ${errors.slice(0, 4).join(" | ")}`);
  await ctx.close();
}

await browser.close();
console.log("\n✓ Скриншоты готовы");
