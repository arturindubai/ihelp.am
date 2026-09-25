#!/usr/bin/env node
/**
 * cc — командная строка Control Center для рабочих сессий iHelp (разработчик, техдиректор, деплоер, продукт).
 * Обёртка над /api/cc: берёт задачу, готовит отдельный git worktree под неё, сдаёт на проверку с фактами из git.
 * Правила — docs/DEV_SYSTEM.md, роли — docs/roles/. Без зависимостей: только Node 20 и git.
 *
 *   node scripts/cc.mjs help
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const HELP = `cc — Control Center из командной строки (docs/DEV_SYSTEM.md)

Смотреть:
  list [статус] [--area back] [--agent dev-1]   задачи; без статуса — все открытые
  show КЛЮЧ                                     задача целиком: требования, связи, лента, готовность
  attention                                     нужно вам: брошенные, очередь проверки, ждут владельца
  worktrees                                     рабочие копии задач на этом сервере

Разработчик (--agent dev-N):
  next --agent dev [--area back]                взять следующую готовую задачу и создать worktree
                                                (--agent dev без номера — первый свободный dev-N)
  take КЛЮЧ --agent dev-1                       взять конкретную (или продолжить свою/брошенную)
  pulse КЛЮЧ                                    пульс вручную (обычно его шлёт хук Claude Code)
  note КЛЮЧ "текст" [--error]                   запись в ленту: ход работы или ошибка
  review КЛЮЧ "отчёт"                           сдать на проверку: ветка должна быть отправлена
  handoff КЛЮЧ "что сделано и что осталось"     передать задачу — вернуть в очередь с веткой
  block КЛЮЧ "причина" --on owner|product|design|tech|external|deps
  unblock КЛЮЧ "что изменилось"

  brief КЛЮЧ [--role dev|tester|deployer|nocode]   брифинг: правила роли, карточка, что сдать

Тестировщик (--agent tester):
  test КЛЮЧ                                     взять на проверку + рабочая копия на коммите ветки
  pass КЛЮЧ "что проверено"                     протестировано (отметка на текущий коммит ветки)
  fail КЛЮЧ "что не так"                        вернуть разработчику

Триаж (--agent triage; также cto и product):
  triage                                        очередь триажа: карточки, которые ещё никто не разобрал
  triaged КЛЮЧ "вердикт"                        карточка разобрана: вердикт в ленту, из очереди триажа уходит
  (в очередь — ready, вопрос — block --on owner|product, поправить поля — update --file)

Новая работа (любой чат — вместо того чтобы делать её сразу):
  intake "что нужно и зачем"                    карточка IN-N в очередь триажа; дальше — триаж и воркеры

Библиотека (знания, инструкции, решения — Control Center → «Библиотека»):
  lib [--kind knowledge|rules|role|process|decision|spec] [--q слово]   список документов
  lib <slug>                                    текущий текст документа (slug — путь в репозитории или note-…)

Сообщения:
  msg "текст" --to owner|cto|workers|triage|dev|tester|deployer [--key КЛЮЧ]
  inbox                                         непрочитанные сообщения твоей роли (отмечаются прочитанными)

Техдиректор и продукт (--agent cto | product):
  ready КЛЮЧ ["комментарий"]                    готова к работе (проверка готовности)
  create --file задача.json                     завести задачу (или --data '{…}' — JSON прямо в команде)
  update КЛЮЧ --file поля.json                  изменить тексты задачи (или --data '{…}')
  cancel КЛЮЧ "причина"

Деплоер (--agent deployer):
  return КЛЮЧ "что исправить"                   вернуть на доработку
  done КЛЮЧ --sha КОММИТ "что проверено после выкладки"
  lock КЛЮЧ / unlock КЛЮЧ                        держать задачу на время выкладки / отпустить
  (выкладка одной задачи целиком — scripts/deploy-task.sh КЛЮЧ)

Уборка:
  gc                                            убрать worktree закрытых задач (только чистые и влитые)

Имя агента: --agent, иначе переменная CC_AGENT, иначе то, с которым задачу брали на этом сервере.`;

/* ───── окружение ───── */

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const name = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--") && !["error", "json", "force", "auto"].includes(name)) {
      flags[name] = next;
      i++;
    } else flags[name] = true;
  } else pos.push(a);
}
const cmd = pos.shift() ?? "help";

const git = (args, cwd = process.cwd()) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryGit = (args, cwd) => {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
};

function die(msg, code = 1) {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

/** Корень основной рабочей копии (/opt/ihelp.am) — даже если команда запущена из worktree задачи */
function mainRoot() {
  const common = tryGit(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!common) die("запускайте из папки проекта iHelp (git-репозиторий)");
  return path.dirname(common);
}
const ROOT = mainRoot();
const STATE = path.join(ROOT, ".git", "cc", "tasks");
const WT = path.join(ROOT, ".claude", "worktrees");

function envValue(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = fs
      .readFileSync(path.join(ROOT, ".env"), "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

const URL_BASE = envValue("CC_URL") || "http://127.0.0.1:8080/api/cc";
const KEY = envValue("CC_AGENT_KEY");

const readState = (key) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(STATE, `${key}.json`), "utf8"));
  } catch {
    return null;
  }
};
const writeState = (key, data) => {
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(path.join(STATE, `${key}.json`), JSON.stringify(data, null, 2));
};
/** Задача ушла от этого исполнителя (сдана, передана, заблокирована): хук больше не шлёт по ней пульс */
const dropState = (key) => fs.rmSync(path.join(STATE, `${key}.json`), { force: true });

function agentFor(key) {
  const a = flags.agent || process.env.CC_AGENT || (key && readState(key)?.agent);
  if (!a || a === true) die("укажите имя агента: --agent dev-1 (роль — префикс имени: dev, cto, product, designer, deployer)");
  return String(a);
}

/* ───── API ───── */

async function api(method, query, body, soft = false) {
  if (!KEY) die("CC_AGENT_KEY пуст: API Control Center выключено (ключ — в .env основной копии)");
  const url = method === "GET" ? `${URL_BASE}?${new URLSearchParams(query)}` : URL_BASE;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { "x-cc-key": KEY, "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    die(`Control Center не отвечает (${URL_BASE}): ${e.message}`);
  }
  const data = await res.json().catch(() => ({}));
  if ((!res.ok || data.error) && soft) return null;
  if (!res.ok || data.error) die(`${data.error ?? res.status}${data.detail ? `: ${data.detail}` : ""}${hint(data.error)}`);
  return data;
}

/** Подсказка, что делать при типовой ошибке — чтобы сессия не гадала */
function hint(code) {
  const h = {
    agent_busy: "\n  У вас уже есть задача в работе: сдайте (review), передайте (handoff) или заблокируйте её.",
    not_ready_status: "\n  Брать можно только «В очереди». Если задача нужна — попросите техдиректора проверить готовность.",
    deps_open: "\n  Сначала должны закрыться зависимости.",
    scope_conflict: "\n  Эти файлы уже меняет другая задача в работе — возьмите другую или договоритесь в ленте.",
    claimed: "\n  Задачу держит другой исполнитель с живой арендой.",
    branch_required: "\n  Отправьте ветку: git push -u origin task/<КЛЮЧ>.",
    report_required: "\n  Отчёт от 40 символов: что сделано, как проверено, как проверить деплоеру.",
    not_ready: "\n  Не выполнены обязательные пункты готовности — см. show КЛЮЧ.",
    sha_required: "\n  Нужен коммит в main: --sha <коммит>.",
    reason_required: "\n  Этот переход требует причину словами.",
    forbidden_transition: "\n  Этой роли такой переход не разрешён (docs/DEV_SYSTEM.md, раздел «Статусы»).",
    not_your_task: "\n  Задачу держит другой исполнитель.",
  };
  return h[code] ?? "";
}

/* ───── вывод ───── */

const STATUS = { backlog: "Бэклог", ready: "В очереди", in_progress: "В работе", review: "На проверке", blocked: "Заблокирована", done: "Сделано", cancelled: "Отменена" };
const line = (t) =>
  `${t.key.padEnd(10)} ${String(STATUS[t.status] ?? t.status).padEnd(13)} ${t.priority}  ${t.title}${t.claimedBy ? `  · ${t.claimedBy}` : ""}${t.health?.stale ? "  · 🪦 брошена?" : ""}${t.health?.phantom ? "  · 👻 без исполнителя" : ""}${t.rework ? `  · ↩${t.rework}` : ""}`;

function printTask(d) {
  const t = d.task;
  const out = [];
  out.push(`${t.key} · ${STATUS[t.status] ?? t.status} · ${t.priority} · ${t.area}/${t.layer}${t.estimate ? ` · ${t.estimate}` : ""}${t.epic ? ` · эпик: ${t.epic.title}` : ""}`);
  out.push(`${t.title}`, "", `Зачем: ${t.summary}`);
  if (t.details) out.push("", t.details);
  out.push("", "Критерии приёмки:", ...t.requirements.map((r, i) => `  ${i + 1}. ${r}`));
  if (t.design) out.push("", `Дизайн: ${t.design}`);
  if (t.qaNotes) out.push("", `Проверка: ${t.qaNotes}`);
  if (t.deployNotes) out.push("", `Выкладка: ${t.deployNotes}`);
  if (t.needs?.length) out.push("", "Нужно от продукта:", ...t.needs.map((n) => `  - ${n}`));
  if (t.scope?.length) out.push("", `Затрагивает: ${t.scope.join(", ")}`);
  if (d.blockers?.length) out.push("", `Зависит от: ${d.blockers.map((b) => `${b.key} (${STATUS[b.status] ?? b.status})`).join(", ")}`);
  if (d.blocking?.length) out.push(`Ждут её: ${d.blocking.map((b) => b.key).join(", ")}`);
  if (t.docs?.length) out.push(`Документы: ${t.docs.join(", ")}`);
  if (d.attachments?.length) out.push(`Файлы: ${d.attachments.map((a) => a.fileName).join(", ")} (смотреть в Control Center)`);
  if (t.claimedBy) out.push("", `Держит: ${t.claimedBy} до ${new Date(t.claimUntil).toLocaleString("ru-RU", { timeZone: "Asia/Yerevan" })}${d.health?.stale ? " — аренда истекла" : ""}`);
  if (t.branch) out.push(`Ветка: ${t.branch}`);
  if (t.blockedReason) out.push(`Блокировка (${t.blockedOn ?? "?"}): ${t.blockedReason}`);
  if (d.readiness && ["backlog", "ready", "blocked"].includes(t.status)) {
    const bad = d.readiness.items.filter((i) => !i.ok);
    out.push("", `Готовность к работе: ${d.readiness.ready ? "да" : "НЕТ"}${bad.length ? ` · не выполнено: ${bad.map((i) => `${i.key}${i.hard ? "!" : ""}`).join(", ")}` : ""}`);
  }
  const feed = (d.comments ?? []).slice(-12);
  if (feed.length) {
    out.push("", "Лента (последние записи):");
    for (const c of feed) out.push(`  [${new Date(c.at).toLocaleString("ru-RU", { timeZone: "Asia/Yerevan" })}] ${c.author} · ${c.kind}: ${c.text.replace(/\n/g, "\n    ")}`);
  }
  console.log(out.join("\n"));
}

/* ───── worktree задачи ───── */

/** Отдельная рабочая копия под задачу: .claude/worktrees/<КЛЮЧ> на ветке task/<КЛЮЧ>. Ничью работу не перезаписывает */
function ensureWorktree(key, branch) {
  const dir = path.join(WT, key);
  // Папка worktree не должна пачкать git status основной копии, даже если .gitignore ещё старый
  const exclude = path.join(ROOT, ".git", "info", "exclude");
  try {
    const cur = fs.existsSync(exclude) ? fs.readFileSync(exclude, "utf8") : "";
    if (!cur.includes(".claude/worktrees/")) fs.appendFileSync(exclude, `${cur.endsWith("\n") || !cur ? "" : "\n"}.claude/worktrees/\n`);
  } catch {}
  const list = tryGit(["worktree", "list", "--porcelain"], ROOT) ?? "";
  if (list.split("\n").includes(`worktree ${dir}`)) return { dir, created: false };
  // Ветка уже где-то открыта — второй worktree на ту же ветку git не даст, и это правильно
  const busy = list.split("\n\n").find((b) => b.includes(`branch refs/heads/${branch}`));
  if (busy) die(`ветка ${branch} уже открыта в ${busy.split("\n")[0].replace("worktree ", "")} — работайте там или закройте ту копию`);
  tryGit(["fetch", "-q", "origin"], ROOT);
  fs.mkdirSync(WT, { recursive: true });
  if (tryGit(["rev-parse", "--verify", "-q", `refs/heads/${branch}`], ROOT)) git(["worktree", "add", dir, branch], ROOT);
  else if (tryGit(["rev-parse", "--verify", "-q", `refs/remotes/origin/${branch}`], ROOT)) git(["worktree", "add", "--track", "-b", branch, dir, `origin/${branch}`], ROOT);
  else git(["worktree", "add", "--no-track", "-b", branch, dir, "origin/main"], ROOT);
  return { dir, created: true };
}

/** --agent dev без номера: первый свободный dev-N — один и тот же стартовый текст годится для любого числа чатов */
async function autoAgent(base) {
  const busy = new Set(((await api("GET", { status: "in_progress" })).tasks ?? []).map((t) => t.claimedBy));
  for (let n = 1; n <= 30; n++) if (!busy.has(`${base}-${n}`)) return `${base}-${n}`;
  die("все имена dev-1…dev-30 заняты");
}

/* ───── брифинг: роль по типу задачи + правила роли + карточка + что сдать ───── */

const ROLE_DOCS = {
  dev: { title: "Разработчик", doc: "docs/roles/DEVELOPER.md" },
  tester: { title: "Тестировщик", doc: "docs/roles/TESTER.md" },
  deployer: { title: "Деплоер", doc: "docs/DEPLOYER_GUIDE.md" },
  nocode: { title: "Исполнитель задачи без кода", doc: "docs/roles/NOCODE.md" },
};

/** Какая роль нужна задаче: код — разработчик, без кода — продуктовая работа; проверка и выкладка — по команде */
const roleForTask = (t) => (t.layer === "none" ? "nocode" : "dev");

function finishSteps(role, t, agent, dir) {
  const k = t.key;
  if (role === "tester")
    return `1. Проверь по docs/roles/TESTER.md: scripts/check.sh, критерии приёмки, соглашения, стенд для интерфейса и денег.
2. Прошло — node scripts/cc.mjs pass ${k} "Проверено: … Как: … Скриншоты: …" --agent ${agent}
3. Не прошло — node scripts/cc.mjs fail ${k} "Что не так: … Как воспроизвести: … Что ожидалось: …" --agent ${agent}
4. Нужен человек — node scripts/cc.mjs block ${k} "вопрос" --on owner|product|tech --agent ${agent}
5. Стенд, если поднимал, — scripts/stand.sh down. Код не чинить, не мёрджить, не выкладывать.`;
  if (role === "nocode")
    return `1. Результат — в карточке: файлы проекта не правь, ветку не создавай. Материал (инструкция, тексты, расчёт, таблица, ссылки на источники) — в отчёте сдачи.
2. Шаги, которые может сделать только человек (аккаунт, оплата, пароль, DNS у регистратора), не делай: node scripts/cc.mjs block ${k} "Что сделать: 1) … 2) … Зачем: …" --on owner --agent ${agent}. После ответа задача вернётся в очередь.
3. Ход работы — note ${k} "…"; не успеваешь — handoff ${k} "что готово, что осталось".
4. Сдать: node scripts/cc.mjs review ${k} "Сделано: … Материал: … Что сделать владельцу: … Как проверить: … Источники: …" --agent ${agent} — задача уйдёт владельцу в «Согласования».
Не мёрджить, не выкладывать, не ставить «Сделано».`;
  if (role === "deployer")
    return `1. Прочитай карточку, отчёт разработчика и отметку тестировщика (лента), диф: git diff origin/main...origin/task/${k}.
2. Если есть ручные шаги (поле «Готовность к деплою»), удаляющая миграция, секрет в коде или отчёт тестировщика не убеждает —
   не выкладывай: node scripts/cc.mjs block ${k} "почему" --on owner --agent ${agent} (или return с причиной).
3. Иначе — scripts/deploy-task.sh ${k}: слияние, бэкап при миграции, выкладка, smoke; при провале — откат и возврат задачи.
   Скрипт сам закроет задачу с доказательством или вернёт её. Больше ничего в проде не делать.`;
  return `1. Работай в рабочей копии ${dir ?? `.claude/worktrees/${k}`} (ветка task/${k}); основную копию /opt/ihelp.am не переключать.
2. Непонятно зачем или критерии не проверяемы — не угадывай: node scripts/cc.mjs block ${k} "вопрос, варианты, предложение" --on product|owner|design|tech --agent ${agent}
3. Проверка: scripts/check.sh; интерфейс — scripts/stand.sh up и node scripts/stand-shot.mjs /ru/… (потом scripts/stand.sh down).
4. Коммиты «${k}: что сделано», git push -u origin task/${k}.
5. Сдать: node scripts/cc.mjs review ${k} "Сделано: … Проверено: … Проверить: … Миграции: … Риски и что не сделано: …" --agent ${agent}
   Ход работы — note ${k} "…"; ошибка — note ${k} "…" --error; не успеваешь — handoff ${k} "что сделано, что осталось".
Не мёрджить, не выкладывать, не ставить «Сделано».`;
}

function briefing(role, d, agent, dir) {
  const r = ROLE_DOCS[role];
  let doc = "";
  try {
    doc = fs.readFileSync(path.join(ROOT, r.doc), "utf8");
    // Инструкция деплоера длинная: воркеру хватит начала, остальное — по ссылке
    if (role === "deployer") doc = `${doc.slice(0, 2500)}\n…\n(полностью — ${r.doc})`;
  } catch {
    doc = `(не нашёл ${r.doc})`;
  }
  const out = [
    `═══ БРИФИНГ · ${d.task.key} · роль: ${r.title} · агент: ${agent} ═══`,
    `Правила твоей роли (${r.doc}) и общие правила (docs/DEV_SYSTEM.md, CLAUDE.md) обязательны.`,
    "",
    doc.trim(),
    "",
    "═══ ЗАДАЧА ═══",
  ];
  console.log(out.join("\n"));
  printTask(d);
  console.log(`\n═══ КАК ДОВЕСТИ ДО КОНЦА ═══\n${finishSteps(role, d.task, agent, dir)}`);
}

async function takeTask(key) {
  let agent = agentFor(key);
  const auto = agent === "dev";
  if (auto) agent = await autoAgent("dev");
  const body = { action: "claim", agent, key, area: flags.area, layer: flags.layer, priority: flags.priority, session: process.env.CLAUDE_SESSION_ID, auto: flags.auto === true };
  let r = await api("POST", null, body, auto);
  // Два чата стартовали одновременно и выбрали одно имя — берём следующее свободное
  for (let i = 0; auto && !r && i < 5; i++) {
    agent = await autoAgent("dev");
    r = await api("POST", null, { ...body, agent }, i < 4);
  }
  if (!r.task) {
    if (flags.json) return console.log(JSON.stringify({ task: null }));
    console.log("Готовых к работе задач по этому фильтру нет. Список: node scripts/cc.mjs list ready");
    return;
  }
  const t = r.task;
  const branch = t.branch || `task/${t.key}`;
  // Задача без кода у воркера «Продукт и не-код»: результат — в карточке, рабочая копия с веткой не нужна
  const { dir, created } = agent.startsWith("nocode") && t.layer === "none" ? { dir: ROOT, created: false } : ensureWorktree(t.key, branch);
  writeState(t.key, { agent, branch, dir, takenAt: new Date().toISOString() });
  if (flags.json) return console.log(JSON.stringify({ task: t.key, agent, dir, branch, role: roleForTask(t) }));
  if (auto) console.log(`Ваше имя агента: ${agent} — используйте его во всех командах этого чата (--agent ${agent}).\n`);
  const d = await api("GET", { key: t.key });
  briefing(roleForTask(d.task), d, agent, dir);
  const ahead = tryGit(["log", "--oneline", `origin/main..${branch}`], ROOT);
  console.log(`
────────────────────────────────────────
✓ ${t.key} взята: ${agent}, аренда ${Math.round((new Date(t.claimUntil) - Date.now()) / 60000)} мин, пульс продлевает её сам (хук Claude Code).
  Рабочая копия: ${dir}${created ? " (создана)" : " (уже была)"} — перейди в неё инструментом EnterWorktree (path=${dir})
  Ветка: ${branch}${ahead ? `\n  В ветке уже есть работа — продолжай с неё:\n${ahead.split("\n").map((l) => `    ${l}`).join("\n")}` : ""}`);
}

/** Тестировщик: держит задачу «На проверке» и получает рабочую копию ровно на последнем коммите ветки */
async function testTask(key) {
  const agent = agentFor(key);
  const r = await api("POST", null, { action: "test-take", agent, key });
  const branch = r.task.branch || `task/${key}`;
  tryGit(["fetch", "-q", "origin"], ROOT);
  const sha = tryGit(["rev-parse", "--verify", "-q", `refs/remotes/origin/${branch}`], ROOT);
  if (!sha) die(`ветки ${branch} нет в репозитории — проверять нечего`);
  const dir = path.join(WT, `test-${key}`);
  const list = tryGit(["worktree", "list", "--porcelain"], ROOT) ?? "";
  if (list.split("\n").includes(`worktree ${dir}`)) git(["checkout", "-q", "--detach", sha], dir);
  else {
    fs.mkdirSync(WT, { recursive: true });
    git(["worktree", "add", "-q", "--detach", dir, sha], ROOT);
  }
  writeState(key, { agent, branch, dir, sha, takenAt: new Date().toISOString() });
  if (flags.json) return console.log(JSON.stringify({ task: key, agent, dir, sha, role: "tester" }));
  const d = await api("GET", { key });
  briefing("tester", d, agent, dir);
  console.log(`\n✓ ${key} взята на проверку: ${agent}. Рабочая копия ${dir} на коммите ${sha.slice(0, 10)} — перейди в неё (EnterWorktree path=${dir}).`);
}

/** Факты для отчёта: коммиты ветки, объём изменений, миграции — деплоер видит их без раскопок */
function branchFacts(branch) {
  tryGit(["fetch", "-q", "origin"], ROOT);
  const remote = tryGit(["rev-parse", "--verify", "-q", `refs/remotes/origin/${branch}`], ROOT);
  if (!remote) die(`ветка ${branch} не отправлена: git push -u origin ${branch}`);
  const local = tryGit(["rev-parse", "--verify", "-q", `refs/heads/${branch}`], ROOT);
  if (local && local !== remote) {
    const unpushed = tryGit(["log", "--oneline", `origin/${branch}..${branch}`], ROOT);
    if (unpushed) die(`в ${branch} есть неотправленные коммиты:\n${unpushed}\nСначала git push`);
  }
  const st = readState(branch.replace(/^task\//, ""));
  if (st?.dir && fs.existsSync(st.dir)) {
    const dirty = tryGit(["status", "--porcelain"], st.dir);
    if (dirty) console.error(`! в рабочей копии ${st.dir} есть незакоммиченные изменения — в проверку они не попадут:\n${dirty}`);
  }
  const commits = tryGit(["log", "--oneline", "--no-merges", `origin/main..origin/${branch}`], ROOT) ?? "";
  if (!commits) die(`в ${branch} нет коммитов поверх main — сдавать нечего`);
  const stat = (tryGit(["diff", "--shortstat", `origin/main...origin/${branch}`], ROOT) ?? "").trim();
  const files = (tryGit(["diff", "--name-only", `origin/main...origin/${branch}`], ROOT) ?? "").split("\n").filter(Boolean);
  const migrations = files.filter((f) => f.startsWith("prisma/migrations/"));
  const behind = tryGit(["rev-list", "--count", `origin/${branch}..origin/main`], ROOT);
  return [
    "",
    "— факты из git —",
    `Ветка: ${branch}${behind && behind !== "0" ? ` (отстаёт от main на ${behind})` : ""}`,
    `Коммиты:\n${commits
      .split("\n")
      .slice(0, 20)
      .map((c) => `  ${c}`)
      .join("\n")}`,
    `Изменения: ${stat}`,
    migrations.length ? `⚠ Миграции базы: ${migrations.join(", ")}` : "Миграций базы нет",
  ].join("\n");
}

/* ───── команды ───── */

const text = () => pos.slice(1).join(" ").trim();
const needKey = () => {
  const k = pos[0]?.toUpperCase();
  if (!k) die("укажите ключ задачи, например AUTH-1");
  return k;
};

async function main() {
  switch (cmd) {
    case "help":
    case "--help":
      console.log(HELP);
      return;
    case "list": {
      const q = {};
      if (pos[0]) q.status = pos[0];
      if (flags.area) q.area = flags.area;
      if (flags.agent) q.agent = flags.agent;
      const r = await api("GET", q);
      if (flags.json) return console.log(JSON.stringify(r.tasks, null, 2));
      console.log(r.tasks.length ? r.tasks.map(line).join("\n") : "Задач нет");
      return;
    }
    case "show": {
      const d = await api("GET", { key: needKey() });
      if (flags.json) return console.log(JSON.stringify(d, null, 2));
      printTask(d);
      return;
    }
    case "attention": {
      const a = await api("GET", { resource: "attention" });
      const block = (title, items, fmt) => items.length && console.log(`${title} (${items.length})\n${items.map(fmt).join("\n")}\n`);
      block("🪦 Брошены или без исполнителя", a.stale, (t) => `  ${t.key} ${t.title} · ${t.claimedBy ?? "никто"}`);
      block("⏳ Ждут проверки", a.review, (t) => `  ${t.key} ${t.title}${t.health.stuckReview ? " · дольше суток" : ""}`);
      block("✋ Ждут владельца или продукта", a.owner, (t) => `  ${t.key} ${t.title} · ${t.blockedReason ?? ""}`);
      block("⚙ В работе", a.working, (t) => `  ${t.key} ${t.title} · ${t.claimedBy} · ${t.health.silentMin ?? "?"} мин назад`);
      console.log(`✓ Готовы к работе: ${a.readyCount}`);
      return;
    }
    case "next":
      return takeTask(undefined);
    case "take":
      return takeTask(needKey());
    case "brief": {
      const k = needKey();
      const d = await api("GET", { key: k });
      const role = typeof flags.role === "string" ? flags.role : roleForTask(d.task);
      if (!ROLE_DOCS[role]) die("роль: dev, tester, deployer или nocode");
      briefing(role, d, flags.agent && flags.agent !== true ? String(flags.agent) : readState(k)?.agent ?? "—", readState(k)?.dir);
      return;
    }
    case "test":
      return testTask(needKey());
    case "pass": {
      const k = needKey();
      if (text().length < 40) die("что проверено — от 40 символов: команды, критерии, страницы, скриншоты");
      const st = readState(k);
      const sha = typeof flags.sha === "string" ? flags.sha : st?.dir && fs.existsSync(st.dir) ? git(["rev-parse", "HEAD"], st.dir) : st?.sha;
      if (!sha) die("не знаю, какой коммит проверен: --sha <коммит>");
      await api("POST", null, { action: "test-pass", agent: agentFor(k), key: k, sha, text: text() });
      dropState(k);
      console.log(`✓ ${k} протестирована на ${sha.slice(0, 10)} — в очереди деплоера`);
      return;
    }
    case "fail": {
      const k = needKey();
      if (text().length < 20) die("что не так — шаги воспроизведения и что ожидалось");
      await api("POST", null, { action: "test-fail", agent: agentFor(k), key: k, text: text() });
      dropState(k);
      console.log(`✓ ${k} возвращена разработчику`);
      return;
    }
    case "lock": {
      const k = needKey();
      await api("POST", null, { action: "deploy-take", agent: agentFor(k), key: k });
      console.log(`✓ ${k} держит ${agentFor(k)} на время выкладки`);
      return;
    }
    case "unlock": {
      const k = needKey();
      await api("POST", null, { action: "review-release", agent: agentFor(k), key: k, text: text() || undefined });
      dropState(k);
      console.log(`✓ аренда ${k} снята`);
      return;
    }
    case "pulse": {
      const k = needKey();
      const r = await api("POST", null, { action: "heartbeat", agent: agentFor(k), key: k });
      console.log(r.ok ? `✓ аренда ${k} продлена до ${new Date(r.until).toLocaleTimeString("ru-RU", { timeZone: "Asia/Yerevan" })}` : `✗ задача больше не ваша: статус ${r.status}, держит ${r.holder ?? "никто"}`);
      return;
    }
    case "note": {
      const k = needKey();
      if (!text()) die("нужен текст записи");
      await api("POST", null, { action: "note", agent: agentFor(k), key: k, text: text(), kind: flags.error ? "error" : "progress" });
      console.log(`✓ запись добавлена в ${k}`);
      return;
    }
    case "review": {
      const k = needKey();
      if (text().length < 40) die("отчёт от 40 символов: что сделано, как проверено (tsc, vitest, стенд), как проверить деплоеру, риски");
      // Задача без кода сдаётся отчётом: ветки и коммитов нет, принимает владелец в «Согласованиях»
      if ((await api("GET", { key: k })).task.layer === "none") {
        await api("POST", null, { action: "review", agent: agentFor(k), key: k, text: text() });
        dropState(k);
        console.log(`✓ ${k} на проверке: задача без кода — её примет владелец в «Согласованиях».`);
        return;
      }
      const st = readState(k);
      const branch = flags.branch || st?.branch || `task/${k}`;
      const report = text() + branchFacts(branch);
      await api("POST", null, { action: "review", agent: agentFor(k), key: k, text: report, branch });
      dropState(k);
      console.log(`✓ ${k} на проверке: сначала тестировщик, затем деплоер. Ветка ${branch}. Рабочую копию оставьте — её уберёт gc после выкладки.`);
      return;
    }
    case "handoff": {
      const k = needKey();
      if (text().length < 20) die("опишите передачу: что сделано, что осталось, где остановились, подводные камни");
      const st = readState(k);
      const facts = st?.branch ? `\nВетка: ${st.branch}${tryGit(["rev-parse", "--verify", "-q", `refs/remotes/origin/${st.branch}`], ROOT) ? " (отправлена)" : " (НЕ отправлена — работа только на этом сервере)"}` : "";
      await api("POST", null, { action: "handoff", agent: agentFor(k), key: k, text: text() + facts });
      dropState(k);
      console.log(`✓ ${k} передана — вернулась в «В очереди». Следующий продолжит с ветки.`);
      return;
    }
    case "block": {
      const k = needKey();
      if (!flags.on) die("укажите, кто разблокирует: --on owner|product|design|tech|external|deps");
      await api("POST", null, { action: "block", agent: agentFor(k), key: k, text: text(), on: flags.on });
      dropState(k);
      console.log(`✓ ${k} заблокирована (${flags.on}). Аренда снята, ветка сохранена.`);
      return;
    }
    case "unblock":
    case "ready":
    case "cancel":
    case "return": {
      const k = needKey();
      const r = await api("POST", null, { action: cmd, agent: agentFor(k), key: k, text: text(), force: flags.force === true });
      console.log(`✓ ${k} → ${STATUS[r.status] ?? r.status}`);
      return;
    }
    case "done": {
      const k = needKey();
      if (!flags.sha) die("нужен коммит в main: --sha <коммит>");
      const r = await api("POST", null, { action: "done", agent: agentFor(k), key: k, sha: String(flags.sha), text: text() });
      console.log(`✓ ${k} → ${STATUS[r.status] ?? r.status}`);
      return;
    }
    case "create":
    case "update": {
      if (!flags.file && !flags.data) die("нужны поля задачи: --file task.json или --data '{\"summary\":\"…\"}' (поля — docs/DEV_SYSTEM.md, раздел «Как завести задачу»)");
      let task;
      try {
        task = JSON.parse(flags.data ? String(flags.data) : fs.readFileSync(String(flags.file), "utf8"));
      } catch (e) {
        die(`поля задачи — не JSON: ${e.message}`);
      }
      const k = cmd === "update" ? needKey() : undefined;
      const r = await api("POST", null, { action: cmd, agent: agentFor(k), key: k, task });
      console.log(`✓ ${r.task.key} ${cmd === "create" ? "заведена" : "обновлена"} · ${STATUS[r.task.status]}`);
      return;
    }
    case "triage": {
      const r = await api("GET", { resource: "triage" });
      if (flags.json) return console.log(JSON.stringify(r.tasks, null, 2));
      console.log(r.tasks.length ? r.tasks.map((t) => `${t.key.padEnd(12)} ${t.priority} ${t.status === "blocked" ? "✋ ответ владельца · " : ""}${t.title}`).join("\n") : "Очередь триажа пуста");
      return;
    }
    case "triaged": {
      const k = needKey();
      if (text().length < 10) die("нужен вердикт словами: что проверено и что решено (в очередь, вопрос, отложено, разбито на …)");
      await api("POST", null, { action: "triaged", agent: agentFor(k), key: k, text: text() });
      console.log(`✓ ${k} разобрана триажем`);
      return;
    }
    case "lib": {
      const base = URL_BASE.replace(/\/api\/cc\/?$/, "/api/cc/library");
      const slug = pos[0];
      const query = new URLSearchParams(slug ? { slug } : { ...(typeof flags.kind === "string" ? { kind: flags.kind } : {}), ...(typeof flags.q === "string" ? { q: flags.q } : {}) });
      const res = await fetch(`${base}?${query}`, { headers: { "x-cc-key": KEY }, signal: AbortSignal.timeout(15000) }).catch((e) => die(`Библиотека не отвечает: ${e.message}`));
      const d = await res.json().catch(() => ({}));
      if (!res.ok) die(d.error ?? res.status);
      if (flags.json) return console.log(JSON.stringify(d, null, 2));
      if (slug) return console.log(`# ${d.title} · v${d.version} · ${d.kind}\n\n${d.content}`);
      console.log(d.docs.length ? d.docs.map((x) => `${x.slug.padEnd(40)} ${x.kind.padEnd(9)} v${x.version}  ${x.title}`).join("\n") : "Документов нет");
      return;
    }
    case "intake": {
      const body = pos.join(" ").trim();
      if (body.length < 10) die('опишите работу хотя бы парой фраз: intake "что нужно и зачем"');
      const agent = flags.agent && flags.agent !== true ? String(flags.agent) : process.env.CC_AGENT || "chat";
      const r = await api("POST", null, { action: "intake", agent, text: body });
      const app = (process.env.CC_URL ? "" : envValue("APP_URL")).replace(/\/$/, "");
      console.log(`✓ ${r.key} в очереди триажа. Сама работа не начинается: триаж превратит текст в задачу, вопросы придут владельцу («Нужен ты»), готовое возьмут воркеры.${app ? `\n  ${app}/ru/admin/control?task=${r.key}` : ""}`);
      return;
    }
    case "msg": {
      const body = pos.join(" ").trim();
      if (body.length < 2) die('нужен текст: msg "текст" --to owner');
      const to = typeof flags.to === "string" ? flags.to : "owner";
      const key = typeof flags.key === "string" ? flags.key.toUpperCase() : undefined;
      await api("POST", null, { action: "message", agent: agentFor(key), to, key, text: body });
      console.log(`✓ сообщение отправлено: ${to}`);
      return;
    }
    case "inbox": {
      const r = await api("GET", { resource: "inbox", agent: agentFor() });
      if (flags.json) return console.log(JSON.stringify(r.messages, null, 2));
      console.log(r.messages.length ? r.messages.map((m) => `[${m.at}] ${m.from}${m.key ? ` · ${m.key}` : ""}: ${m.text}`).join("\n") : "Новых сообщений нет");
      return;
    }
    case "worktrees": {
      const list = (tryGit(["worktree", "list"], ROOT) ?? "").split("\n").filter((l) => l.includes(".claude/worktrees/") || l.includes("ihelp.am-"));
      console.log(list.length ? list.join("\n") : "Рабочих копий задач нет");
      return;
    }
    case "gc": {
      if (!fs.existsSync(WT)) return console.log("Нечего убирать");
      tryGit(["fetch", "-q", "origin"], ROOT);
      for (const name of fs.readdirSync(WT)) {
        const dir = path.join(WT, name);
        // Копия тестировщика — без своих коммитов, убирается, как только задача ушла с проверки
        if (name.startsWith("test-")) {
          const d = await api("GET", { key: name.slice(5) }, null, true);
          if (d?.task?.status === "review" && d.task.claimedBy) {
            console.log(`  ${name}: идёт проверка — оставляю`);
            continue;
          }
          tryGit(["worktree", "remove", "--force", dir], ROOT);
          console.log(`  ${name}: убрана`);
          continue;
        }
        const key = name;
        const d = await api("GET", { key }, null, true);
        const status = d?.task?.status;
        const branch = d?.task?.branch || `task/${key}`;
        if (!["done", "cancelled"].includes(status)) {
          console.log(`  ${key}: ${STATUS[status] ?? status ?? "?"} — оставляю`);
          continue;
        }
        if (tryGit(["status", "--porcelain"], dir)) {
          console.log(`  ${key}: есть незакоммиченные изменения — оставляю`);
          continue;
        }
        const merged = tryGit(["merge-base", "--is-ancestor", branch, "origin/main"], ROOT) !== null;
        if (!merged && status === "done") {
          console.log(`  ${key}: ветка не влита в main — оставляю`);
          continue;
        }
        git(["worktree", "remove", dir], ROOT);
        if (merged) tryGit(["branch", "-d", branch], ROOT);
        fs.rmSync(path.join(STATE, `${key}.json`), { force: true });
        console.log(`  ${key}: убрана`);
      }
      return;
    }
    default:
      die(`неизвестная команда «${cmd}». Справка: node scripts/cc.mjs help`);
  }
}

main();
