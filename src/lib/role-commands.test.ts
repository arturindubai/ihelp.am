import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROLE_DOCS, bashPatternToRegExp, checkCommand, checkDoc, checkTool, extractCommands, parseWorkerRules, pathPatternToRegExp, splitCommand } from "./role-commands.mjs";

/** Уменьшенная копия scripts/worker-run.sh: те же конструкции bash, что в настоящем файле */
const SCRIPT = `#!/usr/bin/env bash
role="$1"
# комментарий с (скобками) и "кавычками"
common=("Bash(cd *)" "Bash(node scripts/cc.mjs *)" "Bash(node */scripts/cc.mjs *)")
check=("Bash(scripts/check.sh*)" "Bash(bash */scripts/check.sh*)")
allow=(Read Glob Grep Edit Write "\${common[@]}" "\${check[@]}"
  "Bash(git *)"
  "Bash(ls *)" "Bash(ls)" "Bash(cat *)" "Bash(grep *)" "Bash(head *)"
  "Bash(curl -s http://127.0.0.1:*)")
deny=("Bash(git push * main)" "Bash(git push --force*)" "Bash(git push * --force*)" "Bash(docker *)" "Bash(sudo *)"
  "Read(//opt/ihelp.am/.env)" "Read(//etc/**)"
  # Субагенты воркеру не нужны
  "Agent")

case "$role" in
  tester)
    # Тестировщик код не правит
    allow=(Read Glob Grep "\${common[@]}" "\${check[@]}" "Bash(git *)" "Bash(ls *)" "Bash(cat *)" "Bash(grep *)" "Bash(head *)"
      "Write(//opt/ihelp.am/data/tmp/tester/**)" "Edit(//opt/ihelp.am/data/tmp/tester/**)")
    deny+=("Bash(git commit *)" "Bash(git push *)")
    ;;
  triage)
    allow=(Read Glob Grep "\${common[@]}" "Bash(git log *)" "Bash(ls *)" "Bash(cat *)"
      "Write(//opt/ihelp.am/data/tmp/triage/**)")
    deny+=("Bash(git commit *)" "Bash(cat >*)")
    ;;
  dev)
    allow+=("Write(//opt/ihelp.am/data/tmp/dev/**)")
    ;;
  *) echo '{"is_error":true,"result":"неизвестная роль"}'; exit 2 ;;
esac
exec claude -p --allowedTools "\${allow[@]}" --disallowedTools "\${deny[@]}"
`;

const rules = parseWorkerRules(SCRIPT);

describe("parseWorkerRules — правила ролей из worker-run.sh", () => {
  it("находит роли и не считает ролью ветку «*»", () => {
    expect(Object.keys(rules).sort()).toEqual(["dev", "tester", "triage"]);
  });

  it("allow=(…) в ветке роли заменяет общий список, allow+=(…) — дополняет", () => {
    expect(rules.tester.allow).not.toContain("Write");
    expect(rules.tester.allow).toContain("Write(//opt/ihelp.am/data/tmp/tester/**)");
    expect(rules.dev.allow).toContain("Write");
    expect(rules.dev.allow).toContain("Write(//opt/ihelp.am/data/tmp/dev/**)");
  });

  it("раскрывает вложенные массивы и не теряет правила со скобками и пробелами", () => {
    expect(rules.triage.allow).toContain("Bash(node */scripts/cc.mjs *)");
    expect(rules.tester.allow).toContain("Bash(bash */scripts/check.sh*)");
    expect(rules.dev.allow).toContain("Bash(curl -s http://127.0.0.1:*)");
  });

  it("deny+=(…) дополняет общий запрет, комментарий внутри массива не становится правилом", () => {
    expect(rules.tester.deny).toContain("Bash(docker *)");
    expect(rules.tester.deny).toContain("Bash(git push *)");
    expect(rules.dev.deny).toContain("Agent");
    expect(rules.dev.deny.some((r) => r.includes("Субагенты") || r === "#")).toBe(false);
  });
});

describe("образцы правил", () => {
  it("«команда *» подходит и команде без аргументов, и с аргументами", () => {
    const re = bashPatternToRegExp("git status *");
    expect(re.test("git status")).toBe(true);
    expect(re.test("git status -sb")).toBe(true);
    expect(re.test("git statusx")).toBe(false);
  });

  it("звёздочка в середине и в начале", () => {
    expect(bashPatternToRegExp("node */scripts/cc.mjs *").test("node /opt/ihelp.am/scripts/cc.mjs show DEV-1")).toBe(true);
    expect(bashPatternToRegExp("git push * main").test("git push origin main")).toBe(true);
    expect(bashPatternToRegExp("git push * main").test("git push origin task/DEV-1")).toBe(false);
  });

  it("путь: ** — любая глубина, // — от корня диска", () => {
    const re = pathPatternToRegExp("//opt/ihelp.am/data/tmp/tester/**");
    expect(re.test("/opt/ihelp.am/data/tmp/tester/pass.md")).toBe(true);
    expect(re.test("/opt/ihelp.am/data/tmp/tester/a/b.md")).toBe(true);
    expect(re.test("/opt/ihelp.am/data/tmp/tester-2/pass.md")).toBe(false);
    expect(re.test("/tmp/pass.md")).toBe(false);
  });
});

describe("splitCommand — части составной команды", () => {
  it("режет по &&, ;, | вне кавычек", () => {
    expect(splitCommand('cd /opt && node x.mjs "a && b; c | d" | head -3; ls')).toEqual(["cd /opt", 'node x.mjs "a && b; c | d"', "head -3", "ls"]);
  });

  it("2>&1 не считает разделителем", () => {
    expect(splitCommand("bash scripts/check.sh 2>&1")).toEqual(["bash scripts/check.sh 2>&1"]);
  });
});

describe("checkCommand — пройдёт ли команда у роли", () => {
  it("единая форма команды доски проходит у каждой роли", () => {
    for (const role of ["dev", "tester", "triage"]) {
      expect(checkCommand(`node /opt/ihelp.am/scripts/cc.mjs note КЛЮЧ --text-file /opt/ihelp.am/data/tmp/${role}/note.md --agent ${role}`, rules[role], role)).toEqual({ ok: true });
    }
  });

  it("«cd /opt/ihelp.am && node scripts/cc.mjs …» — главный отказ: у разработчика и тестировщика путь вне рабочей папки", () => {
    const cmd = 'cd /opt/ihelp.am && node scripts/cc.mjs note DEV-55 "Начинаю" --agent dev-1';
    expect(checkCommand(cmd, rules.dev, "dev")).toMatchObject({ ok: false, part: "cd /opt/ihelp.am" });
    expect(checkCommand(cmd, rules.tester, "tester").ok).toBe(false);
    // Триаж запущен в основной копии — для него это переход внутри рабочей папки
    expect(checkCommand(cmd, rules.triage, "triage").ok).toBe(true);
  });

  it("составная команда отклоняется, если не разрешена хотя бы одна часть", () => {
    const r = checkCommand('node scripts/cc.mjs note DEV-1 "готово" --agent dev-1 2>&1; echo "exit: $?"', rules.dev, "dev");
    expect(r.ok).toBe(false);
  });

  it("запрет сильнее разрешения", () => {
    expect(checkCommand("git push --force-with-lease origin task/DEV-42", rules.dev, "dev")).toMatchObject({ ok: false, reason: expect.stringContaining("запрещено") });
    expect(checkCommand("git push origin main", rules.dev, "dev").ok).toBe(false);
    expect(checkCommand("git push -u origin task/DEV-42", rules.dev, "dev").ok).toBe(true);
    expect(checkCommand("git push -u origin task/DEV-42", rules.tester, "tester").ok).toBe(false);
    expect(checkCommand("docker run --rm homecare-migrate", rules.dev, "dev").ok).toBe(false);
  });

  it("подстановки, переменные, heredoc, несколько строк и запись в файл не проходят", () => {
    expect(checkCommand('node scripts/cc.mjs review DEV-1 "$(cat /tmp/r.txt)"', rules.dev, "dev").ok).toBe(false);
    expect(checkCommand('node scripts/cc.mjs review DEV-1 "цена $PRICE"', rules.dev, "dev").ok).toBe(false);
    expect(checkCommand("cat > data/tmp/dev/x.md << 'EOF'", rules.dev, "dev").ok).toBe(false);
    expect(checkCommand('node scripts/cc.mjs note DEV-1 "первая\nвторая"', rules.dev, "dev").ok).toBe(false);
    expect(checkCommand("ls src > files.txt", rules.dev, "dev").ok).toBe(false);
    expect(checkCommand("CC_URL=http://127.0.0.1:8082/api/cc node scripts/cc.mjs show DEV-1", rules.dev, "dev").ok).toBe(false);
  });

  it("знак доллара в одинарных кавычках — просто текст", () => {
    expect(checkCommand("grep -n '$PRICE' src/lib/pricing.ts", rules.dev, "dev").ok).toBe(true);
  });

  it("безопасные перенаправления не мешают: 2>&1, 2>/dev/null, </dev/null", () => {
    expect(checkCommand("bash /opt/ihelp.am/scripts/check.sh 2>&1", rules.tester, "tester").ok).toBe(true);
    expect(checkCommand("node /opt/ihelp.am/scripts/cc.mjs show DEV-1 2>/dev/null", rules.tester, "tester").ok).toBe(true);
    expect(checkCommand("node /opt/ihelp.am/scripts/cc.mjs show DEV-1 </dev/null", rules.tester, "tester").ok).toBe(true);
  });

  it("чтение командой вне рабочей папки отклоняется, внутри — проходит", () => {
    expect(checkCommand("cat /opt/ihelp.am/scripts/check.sh", rules.tester, "tester")).toMatchObject({ ok: false, reason: expect.stringContaining("вне рабочей папки") });
    expect(checkCommand("ls /opt/ihelp.am/docs/roles/", rules.dev, "dev").ok).toBe(false);
    expect(checkCommand("cat /opt/ihelp.am/.claude/worktrees/test-DEV-1/package.json", rules.tester, "tester").ok).toBe(true);
    expect(checkCommand("cat /opt/ihelp.am/docs/WORKERS.md", rules.triage, "triage").ok).toBe(true);
    expect(checkCommand("cat /etc/nginx/nginx.conf", rules.triage, "triage").ok).toBe(false);
    expect(checkCommand("cat ../../../.env", rules.dev, "dev").ok).toBe(false);
  });

  it("скобки в пути без кавычек отклоняются, в кавычках — проходят", () => {
    expect(checkCommand("grep -n bg-white src/app/[locale]/(site)/page.tsx", rules.dev, "dev").ok).toBe(false);
    expect(checkCommand('grep -n bg-white "src/app/[locale]/(site)/page.tsx"', rules.dev, "dev").ok).toBe(true);
  });

  it("заполнитель <КЛЮЧ> из инструкции — не перенаправление", () => {
    expect(checkCommand("git push -u origin task/<КЛЮЧ>", rules.dev, "dev").ok).toBe(true);
  });

  it("curl разрешён только на локальный стенд и только в записи «curl -s адрес»", () => {
    expect(checkCommand("curl -s http://127.0.0.1:8082/api/health", rules.dev, "dev").ok).toBe(true);
    expect(checkCommand("curl -s https://example.com/", rules.dev, "dev").ok).toBe(false);
    expect(checkCommand('curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/health', rules.dev, "dev").ok).toBe(false);
  });
});

describe("checkTool — запись файла с текстом", () => {
  it("роль пишет в свою папку data/tmp/<роль>/ и больше никуда", () => {
    expect(checkTool("Write", "/opt/ihelp.am/data/tmp/tester/pass-DEV-1.md", rules.tester).ok).toBe(true);
    expect(checkTool("Write", "/tmp/pass-DEV-1.md", rules.tester).ok).toBe(false);
    expect(checkTool("Write", "/opt/ihelp.am/data/tmp/tester-2/pass.md", rules.tester).ok).toBe(false);
    expect(checkTool("Write", "/opt/ihelp.am/src/lib/x.ts", rules.tester).ok).toBe(false);
    expect(checkTool("Write", "/opt/ihelp.am/data/tmp/triage/x.md", rules.triage).ok).toBe(true);
  });

  it("запрет чтения сильнее общего разрешения Read", () => {
    expect(checkTool("Read", "/opt/ihelp.am/.env", rules.dev).ok).toBe(false);
    expect(checkTool("Read", "/etc/passwd", rules.dev).ok).toBe(false);
    expect(checkTool("Read", "/opt/ihelp.am/docs/WORKERS.md", rules.dev).ok).toBe(true);
  });
});

describe("extractCommands и checkDoc — команды из инструкции", () => {
  const md = [
    "# Роль",
    "Прочитать: `node /opt/ihelp.am/scripts/cc.mjs show КЛЮЧ`, файл `docs/DECISIONS.md` и поле `needs`.",
    "```bash",
    "# Инструментом Write: путь /opt/ihelp.am/data/tmp/tester/имя.md",
    "node /opt/ihelp.am/scripts/cc.mjs pass КЛЮЧ --text-file /opt/ihelp.am/data/tmp/tester/pass.md   # протестировано",
    "node /opt/ihelp.am/scripts/cc.mjs review КЛЮЧ --text-file /opt/ihelp.am/data/tmp/tester/r.md \\",
    '  --release "…" --summary "…"',
    "cd /opt/ihelp.am",
    "```",
    "```",
    "таймер systemd → scripts/dispatcher.mjs",
    "```",
  ].join("\n");

  it("берёт строки блоков bash, команды из текста и запись файла из комментария; схемы и названия файлов пропускает", () => {
    const cmds = extractCommands(md).map((c) => c.command);
    expect(cmds).toEqual([
      "node /opt/ihelp.am/scripts/cc.mjs show КЛЮЧ",
      "Write /opt/ihelp.am/data/tmp/tester/имя.md",
      "node /opt/ihelp.am/scripts/cc.mjs pass КЛЮЧ --text-file /opt/ihelp.am/data/tmp/tester/pass.md",
      'node /opt/ihelp.am/scripts/cc.mjs review КЛЮЧ --text-file /opt/ihelp.am/data/tmp/tester/r.md --release "…" --summary "…"',
      "cd /opt/ihelp.am",
    ]);
  });

  it("называет команду, которую инструкция советует, а правила отклоняют, и строку в файле", () => {
    const report = checkDoc(md, rules.tester, "tester");
    expect(report.total).toBe(5);
    expect(report.bad).toHaveLength(1);
    expect(report.bad[0]).toMatchObject({ line: 8, command: "cd /opt/ihelp.am" });
  });
});

/* ───── настоящий файл правил: scripts/ подключается в образ проверки (scripts/check.sh) ───── */

const ROOT = process.cwd();
const RUN_SH = join(ROOT, "scripts", "worker-run.sh");
const ROLES = Object.keys(ROLE_DOCS);

describe.skipIf(!existsSync(RUN_SH))("настоящий scripts/worker-run.sh", () => {
  const real = existsSync(RUN_SH) ? parseWorkerRules(readFileSync(RUN_SH, "utf8")) : {};

  it("в файле есть правила всех семи ролей", () => {
    expect(Object.keys(real).sort()).toEqual([...ROLES].sort());
  });

  it("каждая роль может записать файл с текстом в свою папку data/tmp/<роль>/", () => {
    for (const role of ROLES) expect(checkTool("Write", `/opt/ihelp.am/data/tmp/${role}/note.md`, real[role]), role).toEqual({ ok: true });
  });

  it("роли без правки кода не пишут за пределами своих папок", () => {
    for (const role of ROLES.filter((r) => r !== "dev")) {
      expect(checkTool("Write", "/tmp/note.md", real[role]).ok, role).toBe(false);
      expect(checkTool("Write", "/opt/ihelp.am/src/lib/x.ts", real[role]).ok, role).toBe(false);
      expect(checkTool("Write", "/opt/ihelp.am/scripts/worker-run.sh", real[role]).ok, role).toBe(false);
    }
  });

  it("единая форма команды доски проходит у каждой роли", () => {
    for (const role of ROLES) {
      expect(checkCommand(`node /opt/ihelp.am/scripts/cc.mjs note КЛЮЧ --text-file /opt/ihelp.am/data/tmp/${role}/note.md --agent ${role}`, real[role], role), role).toEqual({ ok: true });
    }
  });

  it("опасное остаётся закрытым у каждой роли", () => {
    const closed = [
      "docker ps",
      "docker compose up -d --build",
      "sudo ls",
      "systemctl stop ihelp-dispatcher.timer",
      "rm -rf data",
      "git push --force origin task/DEV-1",
      "git push --force-with-lease origin task/DEV-1",
      "git push origin task/DEV-1 --force",
      "git push origin main",
      "deploy/update.sh",
      "deploy/rollback.sh",
      "cat .env",
      "cat /opt/ihelp.am/.env",
      "curl -s https://example.com/",
    ];
    for (const role of ROLES) for (const cmd of closed) expect(checkCommand(cmd, real[role], role).ok, `${role}: ${cmd}`).toBe(false);
    for (const role of ROLES) {
      for (const p of ["/opt/ihelp.am/.env", "/etc/passwd", "/var/www/site/index.php", "/root/.claude/settings.json"]) expect(checkTool("Read", p, real[role]).ok, `${role}: ${p}`).toBe(false);
      expect(real[role].deny, role).toContain("Agent");
      expect(real[role].allow.filter((r) => /docker|sudo|systemctl|systemd-run|rm -rf|--force|deploy\/update|deploy\/rollback|\.env|^Agent/.test(r)), role).toEqual([]);
    }
  });
});

// Сами инструкции (docs/roles) здесь не сверяются: в образ проверки папка docs не подключается, в нём лежит копия с main.
// Их сверяет scripts/check-role-commands.mjs на сервере — той же функцией checkDoc.
