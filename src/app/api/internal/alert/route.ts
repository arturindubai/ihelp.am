import { type NextRequest } from "next/server";
import { alertTech } from "@/server/alerts";
import { html } from "@/lib/html";

// Защищённый маршрут: smoke.sh вызывает сюда POST при расхождении счётчиков.
// Токен — CC_AGENT_KEY (тот же, что у API воркеров). Бот-токен в командной строке не используется.
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-cc-key");
  const expected = process.env.CC_AGENT_KEY;
  if (!token || !expected || token !== expected) {
    return new Response("Forbidden", { status: 403 });
  }
  let message: string;
  try {
    const body = (await req.json()) as { message?: unknown };
    message = String(body?.message ?? "").slice(0, 1000);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  if (!message) {
    return new Response("Bad Request", { status: 400 });
  }
  await alertTech("smoke:counter-mismatch", html`${message}`, 60, "smoke");
  return Response.json({ ok: true });
}
