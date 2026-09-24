// Генерирует docs/BACKLOG.md из src/server/backlog.ts:
//   docker compose exec -T app true  # (запускать в образе сборки)
//   npx tsx scripts/backlog-md.mts > docs/BACKLOG.md
import { BACKLOG } from "../src/server/backlog";
import { AREAS, LAYERS, OWNERS, PRIORITIES, STAGES, STATUSES } from "../src/lib/backlog-labels";

const esc = (s: string) => s.replace(/\|/g, "\\|");
const byStage = Object.keys(STAGES);
const done = BACKLOG.filter((t) => t.status === "done").length;

const out: string[] = [
  "# Бэклог продукта iHelp",
  "",
  `Всего задач: ${BACKLOG.length} · работало ещё до Control Center: ${done}. Текущие статусы, исполнители и ход работы — только в Control Center (Админка → Control Center, правила — docs/DEV_SYSTEM.md); этот файл генерируется из кода: \`npx tsx scripts/backlog-md.mts > docs/BACKLOG.md\`.`,
  "",
  "**Приоритеты:** " + Object.entries(PRIORITIES).map(([k, v]) => `\`${k}\` — ${v}`).join(" · "),
  "",
  "**Слои:** " + Object.entries(LAYERS).map(([, v]) => v).join(" · "),
  "",
];

for (const stage of byStage) {
  const tasks = BACKLOG.filter((t) => t.stage === stage);
  if (!tasks.length) continue;
  out.push(`## ${STAGES[stage]} — ${tasks.length}`, "");
  for (const t of tasks) {
    const status = t.status === "done" ? ` · **${STATUSES.done}**` : "";
    out.push(`### ${t.key} — ${t.title}${status}`, "");
    out.push(`${t.summary}`, "");
    if (t.details) out.push(`> ${t.details}`, "");
    out.push(
      `\`${t.priority}\` ${PRIORITIES[t.priority]} · ${AREAS[t.area]} · ${LAYERS[t.layer]} · ${OWNERS[t.owner]}${t.estimate ? ` · ${t.estimate}` : ""}${t.depends?.length ? ` · зависит от: ${t.depends.join(", ")}` : ""}`,
      "",
    );
    out.push("Критерии приёмки:");
    for (const r of t.requirements) out.push(`- ${esc(r)}`);
    if (t.needs?.length) {
      out.push("", "Нужно от продукта:");
      for (const n of t.needs) out.push(`- ${esc(n)}`);
    }
    if (t.docs?.length) out.push("", `Документы: ${t.docs.map((d) => `\`${d}\``).join(", ")}`);
    out.push("");
  }
}

console.log(out.join("\n"));
