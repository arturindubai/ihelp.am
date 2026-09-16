import fs from "fs/promises";
import path from "path";

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", svg: "image/svg+xml", gif: "image/gif" };

export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  const dir = path.resolve(process.env.UPLOAD_DIR || "./data/uploads");
  const file = path.resolve(dir, ...parts);
  if (!file.startsWith(dir + path.sep)) return new Response("Not found", { status: 404 });
  try {
    const data = await fs.readFile(file);
    const ext = file.split(".").pop() || "";
    return new Response(data, { headers: { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable", ...(ext === "svg" ? { "Content-Security-Policy": "script-src 'none'" } : {}) } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
