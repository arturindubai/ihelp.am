#!/usr/bin/env node
/**
 * Диспетчер воркеров iHelp. Запускается таймером systemd (deploy/systemd/ihelp-dispatcher.timer) раз в минуту.
 * Сам токенов не тратит: смотрит очереди в Control Center и запускает claude -p только тогда, когда для воркера есть работа
 * или человек нажал «Запустить сейчас».
 *
 * Проход: сверить работающие запуски с systemd (закончившиеся — записать итог, лог и токены; недоделанную задачу вернуть
 * в очередь; исчерпанный лимит подписки — пауза; «Остановить» — остановить юнит) → спросить у Control Center план →
 * взять задачу и запустить воркера отдельным юнитом systemd (ihelp-w-*) с ограничением по времени → отправить журнал
 * прохода во вкладку «Воркеры». Настройки, очереди и стоп-кран — Control Center → Воркеры.
 *
 *   node scripts/dispatcher.mjs            — один проход (так его вызывает таймер)
 *   node scripts/dispatcher.mjs --dry-run  — показать, кого бы запустил, ничего не запуская
 * Правила — docs/WORKERS.md.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DATA = path.join(ROOT, "data", "workers");
const DRY = process.argv.includes("--dry-run");
fs.mkdirSync(DATA, { recursive: true });

/** Сколько минут воркер может работать, прежде чем systemd его остановит */
const LIMIT_MIN = { triage: 45, dev: 100, tester: 60, deployer: 75 };

function envValue(name) {
  if (process.env[name]) return process.env[name];
  let env = "";
  try {
    env = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
  } catch {}
  const line = env.split("\n").find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
}
const URL_BASE = envValue("CC_URL") || "http://127.0.0.1:8080/api/cc";
const KEY = envValue("CC_AGENT_KEY");

/** Журнал прохода: в stdout (journalctl) и во вкладку «Воркеры» в конце прохода */
const lines = [];
const log = (...a) => {
  const line = [new Date().toISOString().slice(11, 19), ...a].join(" ");
  lines.push(line);
  console.log(line);
};

async function api(body) {
  const res = await fetch(URL_BASE, {
    method: "POST",
    headers: { "x-cc-key": KEY, "content-type": "application/json" },
    body: JSON.stringify({ agent: "dispatcher", ...body }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`${body.action}: ${data.error ?? res.status} ${data.detail ?? ""}`);
  return data;
}
/** Действие от имени самого воркера (сдать, вернуть, отпустить задачу), ошибки не роняют проход */
async function asAgent(agent, body) {
  try {
    const res = await fetch(URL_BASE, { method: "POST", headers: { "x-cc-key": KEY, "content-type": "application/json" }, body: JSON.stringify({ agent, ...body }), signal: AbortSignal.timeout(20000) });
    return await res.json();
  } catch (e) {
    return { error: String(e) };
  }
}
/** Непрочитанные сообщения роли воркера — в его задание; отмечаются прочитанными */
async function inbox(agent) {
  try {
    const res = await fetch(`${URL_BASE}?${new URLSearchParams({ resource: "inbox", agent })}`, { headers: { "x-cc-key": KEY }, signal: AbortSignal.timeout(15000) });
    return (await res.json()).messages ?? [];
  } catch {
    return [];
  }
}

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", cwd: ROOT, ...opts });
const cc = (args) => {
  const r = sh("node", ["scripts/cc.mjs", ...args]);
  if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim().slice(0, 300));
  return r.stdout;
};

/** Текущие коммиты веток задач в GitHub: тестировщик и деплоер работают только с отправленным кодом */
function heads() {
  try {
    const out = execFileSync("git", ["-C", ROOT, "ls-remote", "--heads", "origin", "task/*"], { encoding: "utf8", timeout: 30000 });
    return Object.fromEntries(
      out
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          const [sha, ref] = l.split("\t");
          return [ref.replace("refs/heads/", ""), sha];
        }),
    );
  } catch (e) {
    log("! git ls-remote не ответил — тестировщик и деплоер в этот проход не запускаются", String(e).slice(0, 120));
    return {};
  }
}

const isActive = (unit) => ["active", "activating", "deactivating", "reloading"].includes(sh("systemctl", ["is-active", unit]).stdout.trim());

/** Итог запуска по JSON claude -p: закончен, ошибка или упёрлись в лимит подписки (та же логика, что runOutcome в src/lib/workers.ts) */
function outcome(result, killed) {
  const text = `${result?.result ?? ""} ${result?.subtype ?? ""}`;
  if (/usage limit|limit reached|rate.?limit|out of (extra )?usage|5-hour limit|weekly limit/i.test(text)) return "limit";
  if (!result) return killed ? "timeout" : "failed";
  if (result.subtype === "error_max_turns") return "failed";
  return result.is_error ? "failed" : "done";
}

/** Время сброса лимита из сообщения Claude («…|1759000000»), иначе через час */
function resetAt(result) {
  const m = String(result?.result ?? "").match(/\|(\d{10})/);
  const t = m ? Number(m[1]) * 1000 : Date.now() + 3600_000;
  return new Date(Math.max(t, Date.now() + 5 * 60_000));
}

const workDir = (pool, key) => (pool === "deployer" || pool === "triage" ? ROOT : path.join(ROOT, ".claude", "worktrees", pool === "tester" ? `test-${key}` : key));

/** Снести стенд, который воркер мог оставить поднятым */
function standDown(dir) {
  if (fs.existsSync(path.join(dir, "scripts", "stand.sh"))) sh("bash", ["scripts/stand.sh", "down"], { cwd: dir });
}

const readText = (file) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

/** Сверить запуски с systemd. Возвращает, сколько запусков закончилось в этот проход */
async function reconcile(running, stopAll) {
  let finished = 0;
  for (const run of running) {
    let stopped = false;
    if (isActive(run.unit)) {
      if (!stopAll && !run.stopRequested) continue;
      sh("systemctl", ["stop", run.unit]);
      stopped = true;
      log(`■ остановлен ${run.unit}${run.stopRequested ? " (кнопка «Стоп»)" : ""}`);
    }
    let result = null;
    try {
      result = JSON.parse(readText(path.join(DATA, `${run.id}.json`)));
    } catch {}
    const err = readText(path.join(DATA, `${run.id}.err`)).trim();
    const minutes = (Date.now() - Date.parse(run.startedAt)) / 60000;
    const status = stopped ? "stopped" : outcome(result, minutes >= LIMIT_MIN[run.pool] - 1);
    const summary = ((result?.result ? String(result.result) : err) || "нет ответа").trim().slice(-1500);
    const logText = [result?.result ? String(result.result) : "", err ? `--- stderr ---\n${err.slice(-8000)}` : ""].filter(Boolean).join("\n\n").slice(-20000);
    const u = result?.usage ?? {};
    finished++;
    await api({
      action: "run-finish",
      id: run.id,
      status,
      summary,
      turns: result?.num_turns,
      log: logText || undefined,
      tokensIn: result?.usage ? (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) : undefined,
      tokensOut: u.output_tokens,
      costUsd: result?.total_cost_usd,
    });
    log(`${status === "done" ? "✓" : "✗"} ${run.agent} ${run.taskKey ?? (run.keys?.join(",") || (run.pool === "triage" ? "обзор" : "—"))}: ${status}`);
    if (status === "limit") await api({ action: "workers-pause", until: resetAt(result).toISOString(), text: summary.slice(0, 300) });
    // Вход в подписку пропал или истёк — пауза, пока человек не войдёт заново
    if (/not logged in|\/login|oauth|failed to authenticate|authentication_error|\b401\b/i.test(summary)) {
      await api({ action: "workers-pause", until: new Date(Date.now() + 6 * 3600_000).toISOString(), text: "Воркеры не вошли в Claude. Войти: scripts/claude-login.sh на сервере, затем «Снять паузу» в Control Center → Воркеры." });
    }
    if (!run.taskKey) continue;
    standDown(workDir(run.pool, run.taskKey));

    // Воркер закончил, а задача всё ещё за ним — не ждём сторожа пять часов: возвращаем сразу, ветка сохраняется
    const why = `Запуск воркера ${run.agent} закончился (${status}), задача не сдана. ${result?.result ? `Последнее: ${String(result.result).slice(0, 600)}` : ""}`;
    if (run.pool === "dev") {
      const r = await asAgent(run.agent, { action: "handoff", key: run.taskKey, text: why });
      if (r.ok) log(`↩ ${run.taskKey} возвращена в очередь`);
    } else {
      const r = await asAgent(run.agent, { action: "review-release", key: run.taskKey, text: why });
      if (r.ok) log(`↩ ${run.taskKey}: аренда проверки снята`);
    }
  }
  return finished;
}

/** Задание воркеру: общие правила, роль, брифинг по задаче (или список карточек триажа) и сообщения его роли */
async function prompt(pool, agent, key, extra) {
  const messages = await inbox(agent);
  const notes = messages.length
    ? `\n\nСообщения для твоей роли от людей (учти их в этой работе, если они к ней относятся):\n${messages.map((m) => `- ${m.from}${m.key ? ` · ${m.key}` : ""}: ${m.text}`).join("\n")}`
    : "";
  const ask = key
    ? `Всё, что требует решения человека, — запиши в ленту задачи и заблокируй её (node scripts/cc.mjs block ${key} "вопрос, варианты, предложение" --on owner|product|design|tech --agent ${agent}), затем заверши работу.`
    : `Всё, что требует решения человека, — вопрос с вариантами в карточке (block … --on owner|product) или сообщение владельцу (node scripts/cc.mjs msg "…" --to owner --agent ${agent}).`;
  const common = `Ты — автономный воркер iHelp, агент ${agent}, тебя запустил диспетчер. Людей рядом нет: вопросов в чат не задавай.
${ask}
Сначала прочитай CLAUDE.md и docs/DEV_SYSTEM.md, затем действуй строго по брифингу ниже. Основную копию /opt/ihelp.am не переключай, секреты не выводи.
В самом конце ответь одной строкой: что сделано и в каком статусе задача.${notes}`;

  if (pool === "triage") {
    const role = readText(path.join(ROOT, "docs", "roles", "TRIAGE.md")) || "(нет docs/roles/TRIAGE.md)";
    const task = extra.keys?.length
      ? `Разбери карточки по порядку: ${extra.keys.join(", ")}. Для каждой: show → решение (ready / block с вопросами / отложить) → обязательно triaged с вердиктом. Не успеваешь все — лучше меньше, но честно; неразобранные останутся в очереди.`
      : "Очередь триажа пуста — сделай обзор бэклога по разделу «Обзор бэклога (по расписанию)» и отправь итог владельцу одним сообщением (msg --to owner).";
    return `${common}\n\n${task}\n\n═══ РОЛЬ: ТРИАЖ (docs/roles/TRIAGE.md) ═══\n${role}`;
  }

  const brief = cc(["brief", key, "--role", pool === "dev" ? (extra.role ?? "dev") : pool, "--agent", agent]);
  const role =
    pool === "dev"
      ? `Задача ${key} уже взята за тобой. Текущая папка — её рабочая копия (ветка task/${key}). Доведи задачу до review: сделано, scripts/check.sh зелёный, интерфейс — на стенде со скриншотами, коммиты «${key}: …», git push -u origin task/${key}, честный отчёт. Не успеваешь — закоммить, отправь ветку и сделай handoff с состоянием.`
      : pool === "tester"
        ? `Задача ${key} на проверке и держится за тобой. Текущая папка — её код на коммите ${extra.sha}. Проверь по брифингу и поставь вердикт: pass или fail. Код не правь.`
        : `Задача ${key} протестирована и держится за тобой на время выкладки. Текущая папка — основная копия /opt/ihelp.am: руками в ней ничего не меняй. Проверь карточку, ленту, отметку тестировщика и диф. Стоп-условия — ручные шаги в «Готовности к деплою», удаляющая миграция, секреты в коде, изменение цен, оплаты или прав без явного решения владельца в ленте, пустой отчёт тестировщика: тогда block --on owner или return с причиной. Иначе — одна команда: scripts/deploy-task.sh ${key}. Она сама закроет задачу или вернёт её.`;
  return `${common}\n\n${role}\n\n${brief}`;
}

async function spawn(pool, agent, key, model, extra = {}) {
  const dir = extra.dir ?? workDir(pool, key);
  const unit = `ihelp-w-${agent}-${Date.now().toString(36)}`;
  const { id } = await api({ action: "run-start", pool, worker: agent, key: key ?? undefined, keys: extra.keys ?? [], unit, model, requestedBy: extra.requestedBy });
  const promptFile = path.join(DATA, `${id}.prompt`);
  fs.writeFileSync(promptFile, await prompt(pool, agent, key, extra));
  const r = sh("systemd-run", [
    `--unit=${unit}`,
    "--collect",
    "--quiet",
    `--working-directory=${dir}`,
    "-p", `RuntimeMaxSec=${LIMIT_MIN[pool] * 60}`,
    "-p", "Nice=10",
    "-p", "IOSchedulingClass=best-effort",
    "-p", "IOSchedulingPriority=7",
    "-p", `StandardOutput=file:${path.join(DATA, `${id}.json`)}`,
    "-p", `StandardError=file:${path.join(DATA, `${id}.err`)}`,
    "--setenv=HOME=/root",
    `--setenv=CC_AGENT=${agent}`,
    "--setenv=CC_WORKER=1",
    "--setenv=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "/bin/bash", path.join(ROOT, "scripts", "worker-run.sh"), pool, model, promptFile,
  ]);
  if (r.status !== 0) {
    await api({ action: "run-finish", id, status: "failed", summary: `systemd-run: ${(r.stderr || r.stdout).slice(0, 500)}` });
    throw new Error(`systemd-run не запустил ${unit}`);
  }
  log(`▶ ${agent} → ${key ?? (extra.keys?.length ? extra.keys.join(", ") : "обзор бэклога")} (${model}, ${unit})${extra.requestedBy ? ` · по кнопке: ${extra.requestedBy}` : ""}`);
}

async function main() {
  if (!KEY) return console.log("CC_AGENT_KEY пуст — API Control Center выключено, воркеров не запускаю");
  const h = heads();
  let plan = await api({ action: "dispatch", heads: h });
  // Кто-то закончил — слот освободился, пауза могла начаться: план пересчитываем сразу, не ждём следующего прохода
  if (await reconcile(plan.running, plan.config.stopRunning)) plan = await api({ action: "dispatch", heads: h });
  for (const u of plan.unmet ?? []) log(`· «Запустить сейчас» не выполнено — ${u}`);
  const paused = plan.config.pausedUntil && Date.parse(plan.config.pausedUntil) > Date.now();
  if (!plan.actions.length) return log(paused ? `на паузе до ${plan.config.pausedUntil}` : plan.config.enabled ? "работы нет" : "воркеры выключены в Control Center");
  if (!envValue("CLAUDE_CODE_OAUTH_TOKEN")) return log("нет входа в подписку Claude — задачи не беру: scripts/claude-login.sh");
  if (DRY || plan.config.dryRun) return log("пробный режим, план:", JSON.stringify(plan.actions));

  const pools = plan.config.pools;
  for (const a of plan.actions) {
    const extra = { requestedBy: a.requestedBy };
    try {
      if (a.pool === "dev") {
        const out = JSON.parse(cc(a.key ? ["take", a.key, "--agent", a.agent, "--json"] : ["next", "--agent", a.agent, "--auto", "--json"]));
        if (!out.task) {
          log(`${a.agent}: подходящей задачи нет`);
          continue;
        }
        await spawn("dev", a.agent, out.task, pools.dev.model, { ...extra, dir: out.dir, role: out.role });
      } else if (a.pool === "tester") {
        const out = JSON.parse(cc(["test", a.key, "--agent", a.agent, "--json"]));
        await spawn("tester", a.agent, a.key, pools.tester.model, { ...extra, dir: out.dir, sha: out.sha });
      } else if (a.pool === "deployer") {
        cc(["lock", a.key, "--agent", "deployer"]);
        await spawn("deployer", "deployer", a.key, pools.deployer.model, extra);
      } else if (a.pool === "triage") {
        await spawn("triage", "triage", null, pools.triage.model, { ...extra, keys: a.keys ?? [], sweep: !!a.sweep });
      }
    } catch (e) {
      log(`! ${a.agent} ${a.key ?? ""}: ${String(e.message ?? e).slice(0, 300)}`);
    }
  }
}

main()
  .catch((e) => {
    log("✗ проход диспетчера упал:", String(e.message ?? e).slice(0, 500));
    process.exitCode = 1;
  })
  .finally(async () => {
    // Журнал прохода — во вкладку «Воркеры»; пустые проходы «работы нет» тоже видны: диспетчер жив
    if (KEY && lines.length) await api({ action: "tick", lines }).catch(() => null);
  });
