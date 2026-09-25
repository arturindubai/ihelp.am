#!/usr/bin/env node
// Проверка доски Control Center по инвариантам канона (docs/canon/PROCESS.md): что потеряно или зависло.
// Ничего не меняет. Тот же отчёт — Control Center → «Здоровье» → «Проверка доски».
//   node scripts/cc-audit.mjs [--json]      (CC_URL и CC_AGENT_KEY — как у scripts/cc.mjs)
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const envKey = () => (fs.existsSync(path.join(ROOT, ".env")) ? (fs.readFileSync(path.join(ROOT, ".env"), "utf8").match(/^CC_AGENT_KEY=(.*)$/m)?.[1] ?? "") : "");
const KEY = process.env.CC_AGENT_KEY || envKey();
const URL_BASE = process.env.CC_URL || "http://127.0.0.1:8080/api/cc";
const NAMES = {
  blocked_no_reason: "заблокирована без причины или без того, кто снимает блокировку",
  blocked_answered: "человек ответил после блокировки — ждёт триажа",
  blocked_deps_closed: "заблокирована на зависимостях, а они уже закрыты",
  backlog_untriaged: "в бэклоге без разбора триажем",
  ready_open_deps: "в очереди с открытыми зависимостями",
  review_no_branch: "на проверке без ветки в репозитории",
  review_open_deps: "на проверке с открытыми зависимостями",
  intake_open: "входящая IN-N открыта и не заблокирована",
  deps_unknown: "зависимость на несуществующую задачу",
  in_progress_unclaimed: "в работе без исполнителя",
  in_progress_stale: "в работе без пульса больше часа",
};
if (!KEY) { console.error("CC_AGENT_KEY пуст — API Control Center выключено"); process.exit(2); }
const res = await fetch(`${URL_BASE}?resource=audit`, { headers: { "x-cc-key": KEY }, signal: AbortSignal.timeout(30000) }).catch((e) => { console.error(`Control Center не отвечает: ${e.message}`); process.exit(2); });
const d = await res.json().catch(() => ({}));
if (!res.ok) { console.error(d.error ?? res.status); process.exit(2); }
if (process.argv.includes("--json")) { console.log(JSON.stringify(d, null, 2)); process.exit(0); }
console.log(`Задач: ${d.total} · ${Object.entries(d.byStatus).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
if (!d.checks.length) { console.log("✓ Все задачи на своих местах: потерянных и зависших нет"); process.exit(0); }
for (const c of d.checks) console.log(`\n! ${NAMES[c.id] ?? c.id} (${c.keys.length})\n  ${c.keys.join(", ")}`);
// Только «ждёт триажа» и «без разбора» — нормальная очередь; остальное требует человека
process.exit(d.checks.some((c) => !["backlog_untriaged", "blocked_answered"].includes(c.id)) ? 1 : 0);
