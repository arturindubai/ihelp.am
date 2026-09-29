import { describe, expect, it } from "vitest";
import { DENIALS_MARK, DENIALS_MAX_LEN, DENIALS_MAX_LINES, denialForm, formatDenials } from "./worker-denials-format.mjs";
import { DENIALS_HEADER, denialStats, parseDenials } from "./worker-denials";

const bash = (command: string) => ({ tool_name: "Bash", tool_input: { command } });

describe("denialForm — форма отклонённой команды без текста и ключей", () => {
  it("текст в кавычках, ключ задачи и имя агента не попадают в форму", () => {
    expect(denialForm("Bash", { command: 'cd /opt/ihelp.am && node scripts/cc.mjs note DEV-55 "Начинаю: 8 критериев" --agent dev-1 2>&1' })).toBe(
      'cd /opt/ihelp.am && node scripts/cc.mjs note КЛЮЧ "…" --agent имя 2>&1',
    );
  });

  it("одна и та же команда разных агентов и задач даёт одну форму", () => {
    const a = denialForm("Bash", { command: 'cd /opt/ihelp.am && node scripts/cc.mjs note DEV-76 "Начинаю работу" --agent dev-2' });
    const b = denialForm("Bash", { command: 'cd /opt/ihelp.am && node scripts/cc.mjs note SUB-1 "Начинаю реализацию" --agent dev-3' });
    expect(a).toBe(b);
  });

  it("значения переменных, длинные строки и параметры адреса вырезаются", () => {
    const secret = "0123456789abcdef0123456789abcdef";
    const form = denialForm("Bash", { command: `CC_URL=http://127.0.0.1:8082/api/cc CC_AGENT_KEY=${secret} node /opt/ihelp.am/scripts/cc.mjs ls 2>&1 | head -30` });
    expect(form).toBe("CC_URL=*** CC_AGENT_KEY=*** node /opt/ihelp.am/scripts/cc.mjs ls 2>&1 | head -30");
    expect(denialForm("Bash", { command: `curl -s http://127.0.0.1:8082/api/cc?key=${secret}` })).not.toContain(secret);
    expect(denialForm("Bash", { command: `curl -H x-cc-key:${secret} http://127.0.0.1:8082/` })).not.toContain(secret);
    expect(denialForm("WebFetch", { url: "http://127.0.0.1:8082/api/auth/link?token=abcdef", prompt: "что на странице" })).toBe("WebFetch http://127.0.0.1:8082/…");
  });

  it("многострочная команда — только первая строка: текст heredoc в форму не попадает", () => {
    const form = denialForm("Bash", { command: "cat > /tmp/fail.txt << 'EOF'\nЧто не так: секретный текст отчёта\nEOF\nnode scripts/cc.mjs fail DEV-1 --text-file /tmp/fail.txt" });
    expect(form).toBe("cat > /tmp/fail.txt << '…' ⏎…");
  });

  it("незакрытая кавычка: текст после неё не попадает в форму", () => {
    expect(denialForm("Bash", { command: 'node scripts/cc.mjs note DEV-1 "первая строка\nвторая' })).toBe('node scripts/cc.mjs note КЛЮЧ "…" ⏎…');
  });

  it("запись файла — инструмент и папка, без имени и содержимого", () => {
    expect(denialForm("Write", { file_path: "/tmp/pass-dev74.txt", content: "секрет" })).toBe("Write /tmp/…");
    expect(denialForm("Write", { file_path: "/opt/ihelp.am/data/tmp/tester-2/pass-dev55.md" })).toBe("Write /opt/ihelp.am/data/tmp/tester-2/…");
    expect(denialForm("Agent", { prompt: "секрет" })).toBe("Agent");
  });

  it("форма не длиннее предела и без переводов строки", () => {
    const form = denialForm("Bash", { command: `grep -rn ${"слово ".repeat(60)} src` });
    expect(form.length).toBeLessThanOrEqual(DENIALS_MAX_LEN);
    expect(form).not.toContain("\n");
  });
});

describe("formatDenials и parseDenials — раздел в логе запуска", () => {
  it("раздел читается обратно: число отказов и формы", () => {
    const text = formatDenials([bash('cd /opt/ihelp.am && node scripts/cc.mjs note DEV-1 "x"'), { tool_name: "Write", tool_input: { file_path: "/tmp/a.txt" } }]);
    expect(text.startsWith(DENIALS_MARK)).toBe(true);
    expect(parseDenials(`Ответ воркера: задача сдана.\n\n--- stderr ---\nпредупреждение\n\n${text}`)).toEqual({
      count: 2,
      forms: ['cd /opt/ihelp.am && node scripts/cc.mjs note КЛЮЧ "…"', "Write /tmp/…"],
    });
  });

  it("заголовок диспетчера совпадает с тем, что ждёт разбор", () => {
    expect(DENIALS_HEADER.test(formatDenials([]))).toBe(true);
    expect(DENIALS_HEADER.test(formatDenials([bash("docker ps")]).split("\n")[0])).toBe(true);
  });

  it("запуск без отказов — раздел с нулём: данные есть, отказов нет", () => {
    expect(formatDenials([])).toBe(`${DENIALS_MARK} 0 ---`);
    expect(parseDenials(`готово\n\n${formatDenials([])}`)).toEqual({ count: 0, forms: [] });
  });

  it("ответа воркера не было — раздела нет, данных нет", () => {
    expect(formatDenials(undefined)).toBe("");
    expect(formatDenials(null)).toBe("");
    expect(parseDenials("воркер упал до первой записи")).toBeNull();
    expect(parseDenials(null)).toBeNull();
    expect(parseDenials("")).toBeNull();
  });

  it("много отказов: число полное, форм в логе не больше предела, раздел помещается в хвост лога", () => {
    const many = Array.from({ length: 60 }, (_, i) => bash(`python3 -c "print(${i})" ${"аргумент ".repeat(30)}`));
    const text = formatDenials(many);
    expect(text.length).toBeLessThan(4000);
    const parsed = parseDenials(text);
    expect(parsed?.count).toBe(60);
    expect(parsed?.forms).toHaveLength(DENIALS_MAX_LINES);
  });

  it("берётся последний раздел: текст ответа воркера с похожей строкой не мешает", () => {
    const log = `--- отказы прав: 9 ---\nвыдумка из ответа\n\nещё текст\n\n${formatDenials([bash("docker ps")])}`;
    expect(parseDenials(log)).toEqual({ count: 1, forms: ["docker ps"] });
  });
});

describe("denialStats — сводка для «Здоровья»", () => {
  const run = (...cmds: string[]) => `итог\n\n${formatDenials(cmds.map(bash))}`;

  it("доля запусков с отказами считается среди запусков с данными", () => {
    const s = denialStats([run(), run("docker ps"), run("docker ps", "sudo ls"), run(), "старый запуск без раздела", null]);
    expect(s).toMatchObject({ runs: 6, withData: 4, withDenials: 2, denials: 3, sharePct: 50 });
  });

  it("пять самых частых команд по убыванию", () => {
    const s = denialStats([run("docker ps", "docker ps", "sudo ls"), run("docker ps", "a", "b", "c", "d", "e"), run("sudo ls")]);
    expect(s.top).toHaveLength(5);
    expect(s.top[0]).toEqual({ form: "docker ps", count: 3 });
    expect(s.top[1]).toEqual({ form: "sudo ls", count: 2 });
  });

  it("данных нет — доля не ноль, а «нет данных»", () => {
    expect(denialStats([])).toMatchObject({ runs: 0, withData: 0, sharePct: null, top: [] });
    expect(denialStats(["старый лог", null]).sharePct).toBeNull();
  });

  it("отказов нет — ноль процентов", () => {
    expect(denialStats([run(), run()])).toMatchObject({ withData: 2, withDenials: 0, sharePct: 0, top: [] });
  });
});
