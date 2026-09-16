import { chromium } from "@playwright/test";
import { execSync } from "child_process";
const BASE = "http://localhost:3000";
const DB = "postgresql://app:app@localhost:5432/uyut";
const sql = (q) => execSync(`psql ${DB} -tAc '${q.replace(/'/g, "'\\''")}'`).toString().trim();
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errs = [];
const newCtx = async (w = 390) => {
  const c = await b.newContext({ viewport: { width: w, height: 844 }, isMobile: w < 800, hasTouch: w < 800 });
  const p = await c.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  return p;
};
const ok = (cond, msg) => { if (!cond) { console.log("❌", msg); process.exitCode = 1; } else console.log("✅", msg); };

async function login(p, phone, next = "/ru/login") {
  sql(`delete from "OtpCode" where phone='${phone}'`);
  await p.goto(BASE + next, { waitUntil: "networkidle" });
  await p.locator("#phone").fill(phone);
  await p.getByRole("button", { name: /WhatsApp/ }).click();
  const txt = await p.getByText(/Тестовый режим/).textContent();
  await p.locator("#code").fill(txt.match(/(\d{4,6})/)[1]);
  await p.waitForTimeout(1500);
  if (await p.locator("#name").isVisible()) { await p.locator("#name").fill("Тест"); await p.getByRole("button", { name: "Продолжить" }).click(); await p.waitForTimeout(1200); }
}

// 1. Админ: промокод + привязка телефона мастера
const admin = await newCtx(1280);
await login(admin, "+37400000000");
await admin.waitForURL(/\/admin/);
ok(admin.url().includes("/ru/admin"), "owner redirected to admin after login");
await admin.goto(BASE + "/ru/admin/promos", { waitUntil: "networkidle" });
await admin.getByRole("button", { name: /Новый промокод/ }).click();
await admin.locator("input").nth(0).fill("START20");
await admin.locator('input[type="number"]').first().fill("20");
await admin.getByRole("button", { name: "Сохранить" }).click();
await admin.waitForTimeout(2500);
ok(sql(`select count(*) from "PromoCode" where code='START20'`) === "1", "promo created in admin");

const annaId = sql(`select id from "Master" where slug='anna'`);
await admin.goto(BASE + `/ru/admin/masters/${annaId}`, { waitUntil: "networkidle" });
await admin.locator('input[type="tel"]').fill("+374 91 000002");
await admin.getByRole("button", { name: "Сохранить" }).click();
await admin.waitForTimeout(1500);
ok(sql(`select phone from "Master" where id='${annaId}'`) === "+37491000002", "master phone saved");

// 2. Админ: цена в редакторе услуги
const svcId = sql(`select id from "Service" where slug='regular-cleaning'`);
await admin.goto(BASE + `/ru/admin/services/${svcId}`, { waitUntil: "networkidle" });
await admin.getByRole("button", { name: "Параметры и цены" }).click();
await admin.locator("details").first().locator("summary").click();
const priceInput = admin.locator("details").first().locator('input[type="number"]').first();
await priceInput.fill("9500");
await admin.getByRole("button", { name: "Сохранить" }).click();
await admin.waitForTimeout(2000);
ok(sql(`select price from "Option" o join "OptionGroup" g on g.id=o."groupId" where g."serviceId"='${svcId}' and o."durationMin"=60`) === "9500", "service option price edited");
await priceInput.fill("9000");
await admin.getByRole("button", { name: "Сохранить" }).click();
await admin.waitForTimeout(2000);

// 3. Клиент: разовый заказ с промокодом
const client = await newCtx();
await login(client, "+37491000003");
await client.goto(BASE + "/ru/s/regular-cleaning", { waitUntil: "networkidle" });
await client.getByRole("button", { name: /^Разово/ }).click();
await client.getByRole("button", { name: "Продолжить" }).click();
await client.waitForURL(/\/book\//);
await client.getByRole("button", { name: /Новый адрес/ }).click();
await client.locator("form input").nth(0).fill("Абовяна");
await client.locator("form input").nth(1).fill("5");
await client.getByRole("button", { name: "Сохранить адрес" }).click();
await client.waitForTimeout(800);
await client.locator(".grid-cols-4 button").first().waitFor();
await client.locator(".grid-cols-4 button").first().click();
await client.getByPlaceholder("Введите промокод").fill("start20");
await client.getByRole("button", { name: "Применить" }).click();
try { await client.getByText(/Промокод START20 применён/).waitFor({ timeout: 5000 }); } catch (e) { await client.screenshot({ path: "shots/err-promo.png", fullPage: true }); throw e; }
ok(true, "promo applied at checkout (20% beats 10% first-order)");
await client.screenshot({ path: "shots/10-promo.png", fullPage: true });
await client.getByRole("button", { name: "Подтвердить заказ" }).click();
await client.waitForURL(/\/account\/orders\//, { timeout: 20000 });
const o2 = sql(`select total from "Order" o join "User" u on u.id=o."userId" where u.phone='+37491000003' order by o."createdAt" desc limit 1`);
ok(o2 === "12800", `one-time 2h with START20 = 12 800 (got ${o2})`);
ok(sql(`select "usedCount" from "PromoCode" where code='START20'`) === "1", "promo usage counted");

// 4. Мастер: вход и выполнение визита
const visitId = sql(`select v.id from "Visit" v join "Order" o on o.id=v."orderId" join "User" u on u.id=o."userId" where u.phone='+37491000001' order by v."scheduledAt" asc limit 1`);
sql(`update "Visit" set "masterId"='${annaId}', "scheduledAt"=now() + interval '1 hour' where id='${visitId}'`);
const pro = await newCtx();
await login(pro, "+37491000002");
await pro.waitForURL(/\/pro/);
ok(pro.url().includes("/pro"), "master redirected to /pro");
await pro.waitForLoadState("networkidle");
for (const name of ["Выехал", "Начал", "Завершил"]) {
  await pro.getByRole("button", { name }).first().click();
  await pro.waitForTimeout(1500);
}
await pro.getByRole("button", { name: /Получил наличные/ }).first().click();
await pro.waitForTimeout(1500);
await pro.screenshot({ path: "shots/11-pro.png", fullPage: true });
ok(sql(`select status||cast("cashCollected" as text) from "Visit" where id='${visitId}'`) === "DONEtrue", "master: visit DONE + cash collected");
ok(sql(`select "jobsCount" from "Master" where id='${annaId}'`) === "1", "master jobs counter");

// 5. Клиент 1: отзыв
const c1 = await newCtx();
await login(c1, "+37491000001");
const orderId = sql(`select "orderId" from "Visit" where id='${visitId}'`);
await c1.goto(BASE + `/ru/account/orders/${orderId}`, { waitUntil: "networkidle" });
await c1.getByRole("button", { name: /Оставить отзыв/ }).click();
await c1.locator("textarea").fill("Всё отлично, очень аккуратно!");
await c1.getByRole("button", { name: "Отправить" }).click();
await c1.getByText("Спасибо за отзыв!").waitFor();
ok(sql(`select status from "Review" where "visitId"='${visitId}'`) === "PENDING", "review submitted → moderation");

// 6. Админ: модерация
await admin.goto(BASE + "/ru/admin/reviews", { waitUntil: "networkidle" });
await admin.getByRole("button", { name: "Опубликовать" }).first().click();
await admin.waitForTimeout(1500);
ok(sql(`select "reviewsCount"||'/'||rating from "Master" where id='${annaId}'`) === "1/5", "master rating recalculated after approval");
await admin.goto(BASE + "/ru/masters/anna", { waitUntil: "networkidle" });
ok(await admin.getByText("Всё отлично, очень аккуратно!").isVisible(), "review visible on public master profile");

// 7. Клиент: перенос и пауза подписки
await c1.goto(BASE + `/ru/account/orders/${orderId}`, { waitUntil: "networkidle" });
await c1.getByRole("button", { name: "Поставить на паузу" }).click();
await c1.getByRole("button", { name: "Применить" }).click();
await c1.waitForTimeout(1500);
ok(sql(`select status from "Order" where id='${orderId}'`) === "PAUSED", "client paused subscription");
await c1.getByRole("button", { name: "Возобновить" }).click();
await c1.waitForTimeout(1500);
ok(sql(`select status from "Order" where id='${orderId}'`) === "ACTIVE", "client resumed subscription");

// 8. Пакет: запланировать визит из профиля
await client.goto(BASE + "/ru/s/regular-cleaning", { waitUntil: "networkidle" });
await client.getByRole("button", { name: /Пакет 4 визита/ }).click();
await client.getByRole("button", { name: "Продолжить" }).click();
await client.waitForURL(/\/book\//);
await client.waitForLoadState("networkidle");
try { await client.locator(".grid-cols-4 button").first().waitFor({ timeout: 10000 }); } catch (e) { await client.screenshot({ path: "shots/err-package.png", fullPage: true }); throw e; }
await client.locator(".grid-cols-4 button").nth(1).click();
await client.getByRole("button", { name: "Подтвердить заказ" }).click();
await client.waitForURL(/\/account\/orders\//, { timeout: 20000 });
await client.waitForLoadState("networkidle");
await client.getByRole("button", { name: "Запланировать" }).first().click();
await client.locator(".grid-cols-4 button").first().waitFor();
await client.locator(".grid-cols-4 button").nth(3).click();
await client.getByRole("button", { name: "Готово" }).click();
await client.waitForTimeout(2000);
const pk = sql(`select count(*) filter (where v.status='SCHEDULED')||'/'||count(*) from "Visit" v join "Order" o on o.id=v."orderId" where o.kind='PACKAGE'`);
ok(pk === "2/4", `package: 2 of 4 visits scheduled (got ${pk})`);
await client.screenshot({ path: "shots/12-package.png", fullPage: true });

console.log("page errors:", errs.filter((e) => !e.includes("404")));
await b.close();
