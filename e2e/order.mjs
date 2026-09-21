/**
 * Сквозная проверка: клиент оформляет заказ на телефоне → заказ, визит и адрес попадают в базу →
 * заказ виден в админке с телефоном и адресом → тестовые данные удаляются.
 *
 * Запуск с сервера (каналы доставки кода ещё не подключены, поэтому код входа подставляется
 * тем же хэшем, что считает приложение — секрет не покидает контейнер):
 *
 *   PW=/путь/к/node_modules/playwright/index.mjs CHROME=/путь/к/chrome node e2e/order.mjs
 *
 * Переменные: BASE (по умолчанию http://37.60.236.202:8080), PHONE (тестовый номер),
 * KEEP=1 — не удалять созданные данные.
 */
import { execSync } from "child_process";

const BASE = process.env.BASE || "http://37.60.236.202:8080";
const PHONE = process.env.PHONE || "+37477000099";
const CODE = "424242";
const SERVICE = process.env.SERVICE || "regular-cleaning";
const { chromium } = await import(process.env.PW || "playwright");

const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(ok ? "PASS" : "FAIL", name, extra);
};
const sh = (c) => execSync(c, { shell: "/bin/bash", cwd: "/opt/homecare" }).toString().trim();
const sql = (q) => sh(`docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F"|" -c ${JSON.stringify(q).replace(/'/g, "'\\''")}'`);

/** Подставляет известный код входа: хэш считает сам контейнер приложения */
function setCode(phone, code) {
  const h = sh(
    `docker compose exec -T app node -e 'const c=require("crypto");process.stdout.write(c.createHmac("sha256",process.env.SESSION_SECRET).update(process.argv[1]).digest("hex"))' ${phone}:${code}`,
  );
  sql(
    `update "OtpCode" set "codeHash"='${h}', attempts=0, "consumedAt"=null, "expiresAt"=now()+interval '10 min' where id=(select id from "OtpCode" where phone='${phone}' order by "createdAt" desc limit 1)`,
  );
}

const b = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ru-RU" });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));

// 1. Витрина услуги на телефоне
await p.goto(`${BASE}/ru/s/${SERVICE}`, { waitUntil: "networkidle" });
check("страница услуги открылась", (await p.locator("body").innerText()).length > 200);
check("нет горизонтальной прокрутки", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

// 2. Вход по коду
await p.getByRole("button", { name: "Продолжить" }).first().click();
await p.waitForTimeout(2500);
await p.locator("#phone").fill(PHONE);
await p.getByRole("button", { name: /WhatsApp/ }).first().click();
await p.waitForTimeout(4000);
setCode(PHONE, CODE);
await p.locator("#code").fill(CODE);
await p.waitForTimeout(4000);
if (await p.locator("#name").count()) {
  await p.locator("#name").fill("Тест Проверкин");
  await p.getByRole("button", { name: /Продолжить|Сохранить/ }).first().click();
  await p.waitForTimeout(3000);
}
check("вход по коду выполнен", (await p.locator("body").innerText()).includes("Адрес"));

// 3. Новый адрес (подписи не связаны с полями — заполняем по порядку)
await p.getByRole("button", { name: "Новый адрес" }).first().click();
await p.waitForTimeout(1500);
const inp = p.locator("input");
await p.locator("select").first().selectOption({ index: 1 });
await inp.nth(1).fill("Тестовая улица");
await inp.nth(2).fill("10");
await inp.nth(3).fill("5");
await inp.nth(5).fill("3");
await p.getByRole("button", { name: /Сохранить адрес/ }).first().click();
await p.waitForTimeout(2000);
check("адрес сохранён", (await p.locator("body").innerText()).includes("Тестовая улица"));

// 4. Дата и время
const days = await p.locator("button").filter({ hasText: /сент\.|окт\.|нояб\.|дек\.|янв\./ }).all();
await days[1].click();
await p.waitForTimeout(2000);
let picked = "";
for (const sl of await p.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ }).all()) {
  if (await sl.isEnabled()) {
    picked = (await sl.innerText()).trim();
    await sl.click();
    break;
  }
}
check("слот выбран", !!picked, picked);
await p.waitForTimeout(2000);

// 5. Подтверждение заказа
await p.getByRole("button", { name: /Подтвердить заказ/ }).first().click();
await p.waitForTimeout(8000);
const done = await p.locator("body").innerText();
check("заказ оформлен", done.includes("Заказ оформлен") || /Заказ №\d+/.test(done), done.split("\n").find((l) => l.includes("Заказ")) ?? "");

// 6. Данные в базе
const row = sql(`select o.number, o.status, o.total, v.status, v."scheduledAt" from "Order" o join "Visit" v on v."orderId"=o.id join "User" u on u.id=o."userId" where u.phone='${PHONE}'`);
check("заказ и визит в базе", row.includes("ACTIVE"), row);
check("адрес в базе", sql(`select count(*) from "Address" a join "User" u on u.id=a."userId" where u.phone='${PHONE}'`) === "1");

// 7. Админка видит заказ
if (process.env.TOKEN) {
  const admin = await (await b.newContext({ locale: "ru-RU" })).newPage();
  await admin.goto(`${BASE}/api/auth/link?token=${process.env.TOKEN}`, { waitUntil: "networkidle" });
  await admin.goto(`${BASE}/ru/admin/orders`, { waitUntil: "networkidle" });
  await admin.locator("a[href*='/admin/orders/']").first().click();
  await admin.waitForTimeout(3000);
  const card = await admin.locator("body").innerText();
  check("в админке видны телефон и адрес клиента", card.includes("Тестовая улица") && card.replace(/\s/g, "").includes(PHONE.replace(/\s/g, "")));
} else {
  console.log("SKIP проверка админки: не задан TOKEN (ADMIN_LOGIN_TOKEN)");
}

check("ошибок JS нет", errs.length === 0, errs.slice(0, 3).join(" | "));
await b.close();

// 8. Уборка
if (!process.env.KEEP) {
  sql(`delete from "Visit" where "orderId" in (select o.id from "Order" o join "User" u on u.id=o."userId" where u.phone='${PHONE}')`);
  sql(`delete from "Order" where "userId" in (select id from "User" where phone='${PHONE}')`);
  sql(`delete from "Address" where "userId" in (select id from "User" where phone='${PHONE}')`);
  sql(`delete from "Session" where "userId" in (select id from "User" where phone='${PHONE}')`);
  sql(`delete from "OtpCode" where phone='${PHONE}'`);
  sql(`delete from "User" where phone='${PHONE}'`);
  console.log("тестовые данные удалены; номера заказов при необходимости вернуть: select setval('\"Order_number_seq\"', 1, false)");
}

console.log(`${results.filter(Boolean).length}/${results.length} проверок пройдено`);
process.exit(results.every(Boolean) ? 0 : 1);
