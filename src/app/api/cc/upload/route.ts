import { NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/server/auth";
import { sectionsFor } from "@/server/admin";
import { addAttachment } from "@/server/services/attachments";
import { audit } from "@/server/audit";
import { formatPhone } from "@/lib/phone";

/**
 * Загрузка файлов к задаче или эпику Control Center (макет, документ, скриншот).
 * Отдельно от /api/upload (картинки каталога, раздел settings): здесь шире типы файлов
 * и своя проверка прав — раздел control. Файлы лежат в том же томе uploads, что и картинки,
 * поэтому попадают в тот же ночной бэкап без отдельной настройки.
 */
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/zip": "zip",
};

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || !sectionsFor(u.role).includes("control")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  const taskKey = form.get("taskKey");
  const epicKey = form.get("epicKey");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (typeof taskKey !== "string" && typeof epicKey !== "string") return NextResponse.json({ error: "no_subject" }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "type" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "size" }, { status: 400 });

  const dir = path.resolve(process.env.UPLOAD_DIR || "./data/uploads");
  const month = new Date().toISOString().slice(0, 7);
  await fs.mkdir(path.join(dir, month), { recursive: true });
  const name = `${crypto.randomBytes(8).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(dir, month, name), Buffer.from(await file.arrayBuffer()));
  const url = `/uploads/${month}/${name}`;

  try {
    const attachment = await addAttachment(
      { taskKey: typeof taskKey === "string" ? taskKey : undefined, epicKey: typeof epicKey === "string" ? epicKey : undefined },
      { fileName: file.name.slice(0, 200), url, size: file.size, mime: file.type },
      u.name || formatPhone(u.phone),
    );
    await audit(u.id, "cc.attachment.add", typeof taskKey === "string" ? "Task" : "Epic", (taskKey || epicKey) as string, { fileName: attachment.fileName });
    return NextResponse.json({ ok: true, attachment });
  } catch (e) {
    await fs.unlink(path.join(dir, month, name)).catch(() => {});
    return NextResponse.json({ error: (e as Error).message === "not_found" ? "not_found" : "error" }, { status: 400 });
  }
}
