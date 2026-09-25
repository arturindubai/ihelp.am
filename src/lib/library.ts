/**
 * Библиотека знаний и инструкций (Control Center → «Библиотека», как Canon в админке LIA).
 * Чистые функции: вид документа по пути, заголовок из текста, построчное сравнение версий.
 */

export const LIBRARY_KINDS = ["rules", "role", "process", "decision", "spec", "knowledge"] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

/** Файлы репозитория, которые снимаются в Библиотеку при каждой выкладке */
export const REPO_DOC_ROOTS = ["CLAUDE.md", "README.md", "DESIGN.md", "docs"] as const;

const PROCESS_DOCS = ["DEV_SYSTEM.md", "WORKERS.md", "CONTROL_CENTER.md", "DEPLOYER_GUIDE.md", "DEPLOY_CHECKLIST.md", "TEAM_GUIDE.md", "LIA_TRANSFER.md"];

/** Вид документа репозитория по его пути */
export function kindOfPath(path: string): LibraryKind {
  const p = path.replace(/^\.\//, "");
  if (p === "CLAUDE.md") return "rules";
  if (p.startsWith("docs/roles/")) return "role";
  if (p.startsWith("docs/specs/") || p === "DESIGN.md") return "spec";
  if (p === "docs/DECISIONS.md") return "decision";
  if (PROCESS_DOCS.includes(p.replace(/^docs\//, ""))) return "process";
  return "knowledge";
}

/** Заголовок документа: первая строка «# …», иначе имя файла */
export function titleOf(content: string, fallback: string): string {
  const m = /^#\s+(.+)$/m.exec(content);
  const t = (m ? m[1] : fallback).replace(/[*_`]/g, "").trim();
  return (t || fallback).slice(0, 200);
}

export type DiffOp = { op: "same" | "add" | "del"; text: string };

/**
 * Построчное сравнение двух версий (наибольшая общая подпоследовательность).
 * Для очень длинных текстов (больше 4000 строк) — грубое сравнение: общее начало и конец, середина целиком заменена
 */
export function diffLines(before: string, after: string): DiffOp[] {
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }
  const head: DiffOp[] = a.slice(0, start).map((text) => ({ op: "same", text }));
  const tail: DiffOp[] = a.slice(endA + 1).map((text) => ({ op: "same", text }));
  const midA = a.slice(start, endA + 1);
  const midB = b.slice(start, endB + 1);
  if (midA.length * midB.length > 16_000_000) {
    return [...head, ...midA.map((text) => ({ op: "del" as const, text })), ...midB.map((text) => ({ op: "add" as const, text })), ...tail];
  }
  // Таблица длин общей подпоследовательности для середины
  const n = midA.length;
  const m = midB.length;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const mid: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      mid.push({ op: "same", text: midA[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) mid.push({ op: "del", text: midA[i++] });
    else mid.push({ op: "add", text: midB[j++] });
  }
  while (i < n) mid.push({ op: "del", text: midA[i++] });
  while (j < m) mid.push({ op: "add", text: midB[j++] });
  return [...head, ...mid, ...tail];
}

/** Сколько строк добавлено и удалено — для списка версий */
export function diffStat(ops: DiffOp[]) {
  return { added: ops.filter((o) => o.op === "add").length, removed: ops.filter((o) => o.op === "del").length };
}

/** Сжатый вид сравнения: изменённые строки и по 3 строки контекста вокруг, остальное свёрнуто */
export function diffHunks(ops: DiffOp[], context = 3): (DiffOp | { op: "skip"; count: number })[] {
  const keep = new Array(ops.length).fill(false);
  ops.forEach((o, i) => {
    if (o.op === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) keep[k] = true;
  });
  const out: (DiffOp | { op: "skip"; count: number })[] = [];
  let skipped = 0;
  ops.forEach((o, i) => {
    if (keep[i]) {
      if (skipped) out.push({ op: "skip", count: skipped });
      skipped = 0;
      out.push(o);
    } else skipped++;
  });
  if (skipped) out.push({ op: "skip", count: skipped });
  return out;
}
