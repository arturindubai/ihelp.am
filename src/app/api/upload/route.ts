import { NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/server/auth";
import { sectionsFor } from "@/server/admin";
import { MAX_UPLOAD_BYTES, prepareUpload } from "@/lib/images";

/**
 * Загрузка картинок каталога. Файл проверяется по содержимому, уменьшается и сохраняется как WebP (src/lib/images.ts).
 * Ошибки — коды type (не картинка или SVG), size (слишком большой), broken (повреждён); тексты — в интерфейсе.
 */
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || !sectionsFor(u.role).includes("services")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "size" }, { status: 400 });
  const image = await prepareUpload(Buffer.from(await file.arrayBuffer()));
  if (!image.ok) return NextResponse.json({ error: image.error }, { status: 400 });
  const dir = path.resolve(process.env.UPLOAD_DIR || "./data/uploads");
  const month = new Date().toISOString().slice(0, 7);
  await fs.mkdir(path.join(dir, month), { recursive: true });
  const name = `${crypto.randomBytes(8).toString("hex")}.webp`;
  await fs.writeFile(path.join(dir, month, name), image.data);
  return NextResponse.json({ url: `/uploads/${month}/${name}`, width: image.width, height: image.height });
}
