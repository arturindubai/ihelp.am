#!/usr/bin/env node
/**
 * Однократный скрипт DEV-148: расставляет дорожки (track) всем задачам и эпикам.
 * Запуск (деплоер, из основной копии, после бэкапа):
 *   node scripts/once/set-tracks.mjs --dry-run   # посмотреть что будет
 *   node scripts/once/set-tracks.mjs             # применить
 *
 * Приоритет: явный список из задачи выше → умолчание по правилу trackDefault.
 * Задачи и эпики, у которых track уже задан явно (source=ui), не перезаписываются.
 */
import { PrismaClient } from "@prisma/client";

const DRY = process.argv.includes("--dry-run");
const db = new PrismaClient();

// ─── Явное распределение задач (из карточки техдиректора DEV-148) ───────────

const EXPLICIT = {
  // БИЗНЕС
  business: [
    "AUTH-3","CONTENT-1","CONTENT-2","CONTENT-3","CONTENT-4","CONTENT-12",
    "COMP-35","COMP-36","INFRA-5","LEGAL-3","LEGAL-4","LEGAL-5","LEGAL-7","LEGAL-10",
    "PAY-3","SEO-2","SEO-3","SEO-6","TEAM-2","MON-1","ROUTE-7",
  ],
  // РАЗРАБОТКА
  dev: [
    "ARCH-6","ARCH-9","AUTH-12","AUTH-4","AUTH-9","DB-1","DB-4","DB-7","DB-8",
    "DEV-3","INFRA-6","RISK-1","ADMIN-9","LEGAL-6","MON-2","MON-3","MON-4",
    "NOTIFY-13","NOTIFY-5","NOTIFY-6","OTP-1","OTP-2","OTP-3","PAY-1","PAY-4",
    "ROUTE-1","ROUTE-2","ROUTE-4","ROUTE-5","ROUTE-6","PWA-2",
  ],
  // ПРОДУКТ
  product: ["ACCOUNT-2","CONTENT-10","COMP-26","FLOW-11","NOTIFY-11","IN-41"],
  // ДИЗАЙН
  design: ["DSN-4","DSN-15","DSN-16","DSN-17","NOTIFY-12","CONTENT-19"],
  // ВХОДЯЩИЕ
  inbox: ["IN-66","IN-67","IN-70"],
};

// ─── Явное распределение эпиков ───────────────────────────────────────────

const EPIC_EXPLICIT = {
  business: ["legal","content-team","seo","business-research"],
  product: ["catalog-pricing","booking","subscriptions","client-account","master-cabinet","mobile","notify","payments","product-cjm"],
  dev: ["command-center","admin-roles","auth-security","infra-ops","data-backups","monitoring","dev-process","routes","architecture"],
  design: ["brand"],
};

// ─── Правило умолчания (зеркало trackDefault из src/lib/cc-lanes.ts) ────────

const BUG_PREFIXES = ["AUD","RISK","BUG"];
const BIZ_AREAS   = ["legal","pay","team","seo"];

function trackDefault(t) {
  const prefix = t.key.split("-")[0];
  if (prefix === "IN" || t.source === "intake") return "inbox";
  if (BUG_PREFIXES.includes(prefix))             return "bugs";
  if (prefix === "DSN")                          return "design";
  if (BIZ_AREAS.includes(t.area ?? ""))         return "business";
  if (t.layer === "none" && t.owner === "product") return "business";
  if (t.layer === "none" && t.owner === "tech")   return "product";
  return "dev";
}

// ─── Основная логика ─────────────────────────────────────────────────────────

async function main() {
  // Построить обратный индекс: ключ → дорожка
  const explicitMap = {};
  for (const [track, keys] of Object.entries(EXPLICIT)) {
    for (const key of keys) explicitMap[key] = track;
  }

  const tasks = await db.task.findMany({
    select: { id: true, key: true, area: true, layer: true, owner: true, source: true, track: true },
  });

  let changed = 0, skipped = 0;
  const changes = [];

  for (const t of tasks) {
    // Не перезаписывать явно установленное значение из UI
    if (t.track) { skipped++; continue; }
    const track = explicitMap[t.key] ?? trackDefault(t);
    changes.push({ id: t.id, key: t.key, track, reason: explicitMap[t.key] ? "explicit" : "default" });
    changed++;
  }

  // ─── Эпики ───────────────────────────────────────────────────────────────
  const epicExplicitMap = {};
  for (const [track, keys] of Object.entries(EPIC_EXPLICIT)) {
    for (const key of keys) epicExplicitMap[key] = track;
  }

  const epics = await db.epic.findMany({
    select: { id: true, key: true, track: true },
  });
  const epicChanges = [];
  let epicChanged = 0, epicSkipped = 0;
  for (const e of epics) {
    if (e.track) { epicSkipped++; continue; }
    const track = epicExplicitMap[e.key] ?? "dev";
    epicChanges.push({ id: e.id, key: e.key, track, reason: epicExplicitMap[e.key] ? "explicit" : "default" });
    epicChanged++;
  }

  // ─── Отчёт / применение ──────────────────────────────────────────────────
  console.log(`\nЗадачи: ${changed} будут обновлены, ${skipped} уже имеют track`);
  console.log(`Эпики:  ${epicChanged} будут обновлены, ${epicSkipped} уже имеют track`);

  // Группировка по дорожке для наглядности
  const byTrack = {};
  for (const c of changes) {
    (byTrack[c.track] ??= []).push(c.key);
  }
  for (const [track, keys] of Object.entries(byTrack)) {
    console.log(`  ${track}: ${keys.join(", ")}`);
  }

  const epicByTrack = {};
  for (const c of epicChanges) {
    (epicByTrack[c.track] ??= []).push(c.key);
  }
  for (const [track, keys] of Object.entries(epicByTrack)) {
    console.log(`  эпик/${track}: ${keys.join(", ")}`);
  }

  if (DRY) {
    console.log("\n[dry-run] Изменения не применены");
    return;
  }

  // Применить пачками по 50
  const BATCH = 50;
  for (let i = 0; i < changes.length; i += BATCH) {
    const batch = changes.slice(i, i + BATCH);
    await Promise.all(batch.map((c) => db.task.update({ where: { id: c.id }, data: { track: c.track } })));
    console.log(`  задачи ${i + 1}..${Math.min(i + BATCH, changes.length)} обновлены`);
  }
  for (let i = 0; i < epicChanges.length; i += BATCH) {
    const batch = epicChanges.slice(i, i + BATCH);
    await Promise.all(batch.map((c) => db.epic.update({ where: { id: c.id }, data: { track: c.track } })));
    console.log(`  эпики ${i + 1}..${Math.min(i + BATCH, epicChanges.length)} обновлены`);
  }

  console.log("\n✓ Дорожки расставлены");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
