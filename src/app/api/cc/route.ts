import { NextResponse } from "next/server";
import { attention, getTask, listTasks, annotate, saveTask } from "@/server/services/cc";
import { CcError, agentActor, agentNote, claim, heartbeat, transition, type TransitionInput } from "@/server/services/ccWork";
import { listEpics, getEpic } from "@/server/services/epics";
import { DESIGNER_FIELDS, taskContentSchema } from "@/lib/cc-schema";
import { roleOf, type TaskStatusKey } from "@/lib/cc-flow";
import type { Task } from "@prisma/client";

/**
 * API Control Center для рабочих сессий (разработчики, техдиректор, деплоер, продукт, дизайнер).
 * Ключ — заголовок x-cc-key (CC_AGENT_KEY в .env); пустой ключ в окружении выключает API.
 * Роль агента берётся из префикса имени: dev-2, cto, product, designer, deployer. Права и гейты — src/lib/cc-flow.ts.
 * Удобнее, чем curl, — scripts/cc.mjs; правила работы — docs/DEV_SYSTEM.md.
 *
 *   GET  /api/cc?status=ready&area=back       — список задач (без status — только открытые)
 *   GET  /api/cc?key=AUTH-1                   — задача целиком: тексты, связи, лента, история, готовность, здоровье
 *   GET  /api/cc?resource=attention           — «нужно вам»: брошенные, очередь проверки, ждут владельца
 *   GET  /api/cc?resource=epics[&key=…]       — эпики
 *   POST /api/cc {"action":"claim","agent":"dev-1"[,"key":"AUTH-1"]}  — взять задачу (аренда 60 минут, пульс продлевает)
 *   POST /api/cc {"action":"heartbeat","agent":"dev-1","key":"AUTH-1"} — пульс
 *   POST /api/cc {"action":"note","agent":"dev-1","key":"AUTH-1","text":"…","kind":"progress|error|note"}
 *   POST /api/cc {"action":"review","agent":"dev-1","key":"AUTH-1","text":"отчёт","branch":"task/AUTH-1"}
 *   POST /api/cc {"action":"handoff"|"block"|"unblock"|"ready"|"return"|"done"|"cancel", …}
 *   POST /api/cc {"action":"create"|"update", "agent":"cto", "task":{…}}
 */
function authorized(req: Request) {
  const key = process.env.CC_AGENT_KEY;
  return !!key && req.headers.get("x-cc-key") === key;
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const deny = () => json({ error: "forbidden" }, 403);

function fail(e: unknown) {
  if (e instanceof CcError) {
    const status = e.code === "not_found" ? 404 : e.code.startsWith("forbidden") || e.code === "not_your_task" ? 403 : 409;
    return json({ error: e.code, detail: e.detail ?? null }, status);
  }
  const msg = (e as Error)?.message ?? "error";
  // Ошибки проверки содержимого из saveTask — это ошибки запроса, а не сервера
  if (/^(bad_key|key_exists|not_found|unknown_depends|unknown_epic)/.test(msg)) return json({ error: msg.split(":")[0], detail: msg.split(":")[1] ?? null }, 400);
  console.error("[cc api]", e);
  return json({ error: "server_error" }, 500);
}

/** Задача в ответе API: всё, что нужно исполнителю, без внутренних id */
const brief = (t: Task) => ({
  key: t.key,
  title: t.title,
  summary: t.summary,
  status: t.status,
  priority: t.priority,
  stage: t.stage,
  area: t.area,
  layer: t.layer,
  epicKey: t.epicKey,
  depends: t.depends,
  scope: t.scope,
  claimedBy: t.claimedBy,
  claimUntil: t.claimUntil,
  heartbeatAt: t.heartbeatAt,
  branch: t.branch,
  rework: t.rework,
  reclaims: t.reclaims,
});

const full = (t: Task) => ({
  ...brief(t),
  details: t.details,
  requirements: t.requirements,
  design: t.design,
  qaNotes: t.qaNotes,
  deployNotes: t.deployNotes,
  needs: t.needs,
  docs: t.docs,
  owner: t.owner,
  estimate: t.estimate,
  blockedOn: t.blockedOn,
  blockedReason: t.blockedReason,
  deployedSha: t.deployedSha,
  proof: t.proof,
  source: t.source,
});

export async function GET(req: Request) {
  if (!authorized(req)) return deny();
  const p = new URL(req.url).searchParams;
  try {
    if (p.get("resource") === "epics") {
      if (p.get("key")) {
        const data = await getEpic(p.get("key") as string);
        if (!data) return json({ error: "not_found" }, 404);
        return json({ epic: data.epic, tasks: data.epic.tasks, blockers: data.blockers, blocking: data.blocking });
      }
      const epics = await listEpics({ status: p.get("status") ?? undefined });
      return json({
        epics: epics.map((e) => ({ key: e.key, title: e.title, summary: e.summary, requirements: e.requirements, status: e.status, taskTotal: e.taskTotal, taskDone: e.taskDone })),
      });
    }

    if (p.get("resource") === "attention") return json(await attention());

    if (p.get("key")) {
      const data = await getTask((p.get("key") as string).toUpperCase());
      if (!data) return json({ error: "not_found" }, 404);
      const { task } = data;
      return json({
        task: { ...full(task), epic: task.epicRef },
        blockers: data.blockers.map((b) => ({ key: b.key, title: b.title, status: b.status })),
        blocking: data.blocking.map((b) => ({ key: b.key, title: b.title, status: b.status })),
        readiness: data.readiness,
        health: data.health,
        comments: task.comments.map((c) => ({ kind: c.kind, author: c.author, text: c.text, at: c.createdAt })),
        events: task.events.slice(0, 50).map((e) => ({ actor: e.actor, field: e.field, from: e.from, to: e.to, at: e.createdAt })),
        attachments: task.attachments.map((a) => ({ fileName: a.fileName, url: a.url, size: a.size })),
      });
    }

    const tasks = await annotate(
      await listTasks({
        status: p.get("status") ?? undefined,
        area: p.get("area") ?? undefined,
        layer: p.get("layer") ?? undefined,
        priority: p.get("priority") ?? undefined,
        claimedBy: p.get("agent") ?? undefined,
        epicKey: p.get("epicKey") ?? undefined,
        q: p.get("q") ?? undefined,
        open: !p.get("status"),
      }),
    );
    return json({ tasks: tasks.map((t) => ({ ...brief(t), health: t.health, dorOk: t.dorOk })) });
  } catch (e) {
    return fail(e);
  }
}

type Body = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** Короткие имена действий → переход статуса; from — из какого статуса действие имеет смысл */
const SHORTCUTS: Record<string, { to: TaskStatusKey; from?: string }> = {
  review: { to: "review" },
  handoff: { to: "ready", from: "in_progress" },
  block: { to: "blocked" },
  unblock: { to: "ready", from: "blocked" },
  ready: { to: "ready" },
  return: { to: "ready", from: "review" },
  done: { to: "done" },
  cancel: { to: "cancelled" },
};

export async function POST(req: Request) {
  if (!authorized(req)) return deny();
  const body = (await req.json().catch(() => ({}))) as Body;
  const agent = (str(body.agent) ?? "").trim().slice(0, 60);
  if (!agent) return json({ error: "agent_required" }, 400);
  const action = str(body.action) ?? "";
  const key = str(body.key)?.trim().toUpperCase();
  const text = str(body.text) ?? "";
  const actor = agentActor(agent);

  try {
    switch (action) {
      case "claim": {
        const task = await claim(agent, { key, area: str(body.area), layer: str(body.layer), priority: str(body.priority), branch: str(body.branch), session: str(body.session) });
        return json({ ok: true, task: task ? full(task) : null });
      }
      case "heartbeat": {
        if (!key) return json({ error: "key_required" }, 400);
        return json(await heartbeat(key, agent, { branch: str(body.branch), session: str(body.session) }));
      }
      case "note":
      case "comment": {
        if (!key) return json({ error: "key_required" }, 400);
        const kind = str(body.kind) ?? "progress";
        if (!["progress", "note", "error"].includes(kind)) return json({ error: "bad_kind" }, 400);
        await agentNote(key, agent, kind as "progress" | "note" | "error", text);
        return json({ ok: true });
      }
      case "status":
      case "review":
      case "handoff":
      case "block":
      case "unblock":
      case "ready":
      case "return":
      case "done":
      case "cancel": {
        if (!key) return json({ error: "key_required" }, 400);
        const sc = SHORTCUTS[action];
        const to = (sc?.to ?? str(body.to)) as TaskStatusKey | undefined;
        if (!to) return json({ error: "to_required" }, 400);
        if (sc?.from) {
          const current = (await getTask(key))?.task.status;
          if (current && current !== sc.from) return json({ error: "wrong_status", detail: current }, 409);
        }
        const input: TransitionInput = { to, text, force: body.force === true, blockedOn: str(body.on), sha: str(body.sha), branch: str(body.branch) };
        const task = await transition(key, input, actor);
        return json({ ok: true, status: task.status, task: brief(task) });
      }
      case "report": {
        // Старый формат отчёта: текст + статус review | blocked | backlog. Оставлен для совместимости
        if (!key || !text) return json({ error: "key_and_text_required" }, 400);
        const wanted = str(body.status) ?? "review";
        const to: TaskStatusKey = wanted === "blocked" ? "blocked" : wanted === "backlog" ? "ready" : "review";
        const task = await transition(key, { to, text, branch: str(body.branch) }, actor);
        return json({ ok: true, status: task.status });
      }
      case "create":
      case "update": {
        const role = roleOf(agent);
        if (!["cto", "product", "owner", "designer"].includes(role) || (action === "create" && role === "designer")) return json({ error: "forbidden_role", detail: role }, 403);
        const raw = (body.task ?? {}) as Body;
        let content: Body = raw;
        if (action === "update") {
          if (!key) return json({ error: "key_required" }, 400);
          const current = (await getTask(key))?.task;
          if (!current) return json({ error: "not_found" }, 404);
          const allowed = role === "designer" ? (DESIGNER_FIELDS as readonly string[]) : Object.keys(raw);
          const patch = Object.fromEntries(Object.entries(raw).filter(([k]) => allowed.includes(k) && k !== "key"));
          content = { ...full(current), ...patch, key };
        }
        const parsed = taskContentSchema.safeParse(content);
        if (!parsed.success) return json({ error: "invalid", detail: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, 400);
        const task = await saveTask(parsed.data, agent, action === "create", "api");
        return json({ ok: true, task: brief(task) });
      }
      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    return fail(e);
  }
}
