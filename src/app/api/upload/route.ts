import { NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/server/auth";
import { sectionsFor } from "@/server/admin";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif" };

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || !sectionsFor(u.role).includes("services")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "type" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "size" }, { status: 400 });
  const dir = path.resolve(process.env.UPLOAD_DIR || "./data/uploads");
  const month = new Date().toISOString().slice(0, 7);
  await fs.mkdir(path.join(dir, month), { recursive: true });
  const name = `${crypto.randomBytes(8).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(dir, month, name), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ url: `/uploads/${month}/${name}` });
}
