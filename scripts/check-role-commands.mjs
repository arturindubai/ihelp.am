#!/usr/bin/env node
/**
 * Сверка инструкций ролей с правами воркеров (DEV-79).
 * Читает команды из docs/roles/*.md (блоки ```bash и команды в обратных кавычках) и проверяет по правилам
 * scripts/worker-run.sh, что роль может их выполнить. Печатает команды, которые инструкция советует, а правила отклоняют.
 *
 *   node scripts/check-role-commands.mjs            # сверить инструкции ролей воркеров
 *   node scripts/check-role-commands.mjs --deployer # плюс начало docs/DEPLOYER_GUIDE.md, которое получает воркер-деплоер
 *   node scripts/check-role-commands.mjs --rules    # напечатать правила каждой роли
 *
 * Код возврата 0 — расхождений нет, 1 — есть. Ничего не меняет, в сеть не ходит.
 * Логика сопоставления — src/lib/role-commands.mjs (покрыта тестом src/lib/role-commands.test.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE_DOCS, checkDoc, parseWorkerRules } from "../src/lib/role-commands.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const rules = parseWorkerRules(fs.readFileSync(path.join(root, "scripts", "worker-run.sh"), "utf8"));

if (args.has("--rules")) {
  for (const [role, r] of Object.entries(rules)) {
    console.log(`\n═══ ${role} ═══\nallow (${r.allow.length}):\n  ${r.allow.join("\n  ")}\ndeny (${r.deny.length}):\n  ${r.deny.join("\n  ")}`);
  }
  process.exit(0);
}

let bad = 0;
let total = 0;
const seen = new Set();
for (const [role, doc] of Object.entries(ROLE_DOCS)) {
  if (role === "deployer" && !args.has("--deployer")) continue;
  seen.add(path.basename(doc));
  if (!rules[role]) {
    console.log(`✗ ${role}: в scripts/worker-run.sh нет правил этой роли`);
    bad++;
    continue;
  }
  let text;
  try {
    text = fs.readFileSync(path.join(root, doc), "utf8");
  } catch {
    console.log(`✗ ${role}: нет файла ${doc}`);
    bad++;
    continue;
  }
  // Воркер-деплоер получает в брифинге только начало своей инструкции (scripts/cc.mjs → briefing)
  if (role === "deployer") text = text.slice(0, 2500);
  const report = checkDoc(text, rules[role], role);
  total += report.total;
  if (!report.bad.length) {
    console.log(`✓ ${role} · ${doc}: команд ${report.total}, отклонённых нет`);
    continue;
  }
  bad += report.bad.length;
  console.log(`✗ ${role} · ${doc}: команд ${report.total}, правила отклоняют ${report.bad.length}:`);
  for (const b of report.bad) {
    console.log(`    строка ${b.line}: ${b.command}`);
    console.log(`      причина: ${b.reason}${b.part && b.part !== b.command ? ` — часть «${b.part}»` : ""}`);
  }
}

const skipped = fs
  .readdirSync(path.join(root, "docs", "roles"))
  .filter((f) => f.endsWith(".md") && !seen.has(f));
if (skipped.length) console.log(`· без воркера (не сверяются, это роли людей и чатов): ${skipped.join(", ")}`);

console.log(bad ? `\nРАСХОЖДЕНИЙ: ${bad} из ${total} команд` : `\nСВЕРКА OK: команд ${total}, расхождений нет`);
process.exit(bad ? 1 : 0);
