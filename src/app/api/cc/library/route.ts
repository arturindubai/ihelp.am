import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { sectionsFor } from "@/server/admin";
import { createNote, getLibraryDoc, listLibrary, LibraryError } from "@/server/services/library";

/**
 * Библиотека для людей и агентов.
 *   GET /api/cc/library?slug=docs/WORKERS.md&v=3   — версия документа файлом .md (вход в админку, раздел control)
 *   GET /api/cc/library  (заголовок x-cc-key)       — список документов для агентов
 *   GET /api/cc/library?slug=…  (x-cc-key)          — текущий текст документа для агентов (JSON)
 *   POST /api/cc/library {title, kind, content, agent} (x-cc-key) — новая запись команды (cc.mjs lib add)
 */
export async function POST(req: Request) {
  if (!process.env.CC_AGENT_KEY || req.headers.get("x-cc-key") !== process.env.CC_AGENT_KEY) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { title?: unknown; kind?: unknown; content?: unknown; agent?: unknown };
  const content = typeof b.content === "string" ? b.content.trim() : "";
  if (content.length < 20 || content.length > 200_000) return NextResponse.json({ error: "content_required" }, { status: 400 });
  try {
    const doc = await createNote({ title: typeof b.title === "string" ? b.title : "", kind: typeof b.kind === "string" ? b.kind : "knowledge", content }, typeof b.agent === "string" && b.agent ? b.agent : "api");
    return NextResponse.json({ ok: true, slug: doc.slug, title: doc.title, kind: doc.kind });
  } catch (e) {
    if (e instanceof LibraryError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const agent = !!process.env.CC_AGENT_KEY && req.headers.get("x-cc-key") === process.env.CC_AGENT_KEY;
  const u = agent ? null : await getCurrentUser();
  if (!agent && (!u || !sectionsFor(u.role).includes("control"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const slug = p.get("slug");
  if (!slug) {
    if (!agent) return NextResponse.json({ error: "slug_required" }, { status: 400 });
    return NextResponse.json({ docs: await listLibrary({ q: p.get("q") ?? undefined, kind: p.get("kind") ?? undefined }) });
  }
  const data = await getLibraryDoc(slug, Number(p.get("v")) || undefined);
  if (!data?.current) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (agent) {
    return NextResponse.json({ slug: data.doc.slug, title: data.current.title, kind: data.doc.kind, version: data.current.n, updatedAt: data.current.createdAt, content: data.current.content });
  }
  const base = (data.doc.path ?? data.doc.slug).split("/").pop()!.replace(/\.md$/, "").replace(/[^\w.-]+/g, "_") || "doc";
  return new Response(data.current.content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}-v${data.current.n}.md"`,
      "Cache-Control": "no-store",
    },
  });
}
