import { NextResponse } from "next/server";
import { claimNext, heartbeat, listTasks, releaseTask, addComment } from "@/server/services/cc";

/**
 * API задач Control Center для агентов. Ключ — заголовок x-cc-key (CC_AGENT_KEY в .env).
 * Пустой ключ в окружении полностью выключает API.
 *
 *   GET  /api/cc?status=backlog&area=back            — список задач
 *   POST /api/cc  {"action":"claim","agent":"...","area":"back"}      — взять задачу в работу (аренда 60 минут)
 *   POST /api/cc  {"action":"heartbeat","agent":"...","key":"AUTH-1"} — продлить аренду
 *   POST /api/cc  {"action":"report","agent":"...","key":"AUTH-1","text":"...","status":"review"} — отчёт и передача человеку
 *
 * Агент не закрывает задачи: статус done ставит человек в интерфейсе.
 */
function authorized(req: Request) {
  const key = process.env.CC_AGENT_KEY;
  return !!key && req.headers.get("x-cc-key") === key;
}

const deny = () => NextResponse.json({ error: "forbidden" }, { status: 403 });

export async function GET(req: Request) {
  if (!authorized(req)) return deny();
  const p = new URL(req.url).searchParams;
  const tasks = await listTasks({
    status: p.get("status") ?? undefined,
    area: p.get("area") ?? undefined,
    layer: p.get("layer") ?? undefined,
    priority: p.get("priority") ?? undefined,
    open: !p.get("status"),
  });
  return NextResponse.json({
    tasks: tasks.map((t) => ({
      key: t.key,
      title: t.title,
      summary: t.summary,
      details: t.details,
      requirements: t.requirements,
      depends: t.depends,
      area: t.area,
      layer: t.layer,
      priority: t.priority,
      stage: t.stage,
      status: t.status,
      claimedBy: t.claimedBy,
    })),
  });
}

export async function POST(req: Request) {
  if (!authorized(req)) return deny();
  const body = (await req.json().catch(() => ({}))) as Record<string, string>;
  const agent = (body.agent || "").trim().slice(0, 60);
  if (!agent) return NextResponse.json({ error: "agent_required" }, { status: 400 });

  switch (body.action) {
    case "claim": {
      const task = await claimNext(agent, { area: body.area, layer: body.layer, priority: body.priority });
      return NextResponse.json(task ? { ok: true, task: { key: task.key, title: task.title, summary: task.summary, details: task.details, requirements: task.requirements, claimUntil: task.claimUntil } } : { ok: true, task: null });
    }
    case "heartbeat": {
      if (!body.key) return NextResponse.json({ error: "key_required" }, { status: 400 });
      return NextResponse.json({ ok: await heartbeat(body.key, agent) });
    }
    case "report": {
      if (!body.key || !body.text) return NextResponse.json({ error: "key_and_text_required" }, { status: 400 });
      const status = ["review", "blocked", "backlog"].includes(body.status) ? (body.status as "review" | "blocked" | "backlog") : "review";
      const released = await releaseTask(body.key, agent, status, body.text);
      if (released) return NextResponse.json({ ok: true, status: released.status });
      // Задача не в аренде у этого агента — отчёт всё равно сохраняем
      await addComment(body.key, body.text, agent, "report");
      return NextResponse.json({ ok: true, status: null, note: "not_claimed_by_agent" });
    }
    default:
      return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
}
