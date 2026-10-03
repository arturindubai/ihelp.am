import "server-only";
import fs from "fs/promises";
import path from "path";
import { db } from "../db";
import { staleFiles, extractUploadUrls } from "@/lib/cleanup";

/** Вычисляет путь в корзине: uploads/_trash/YYYY-MM-DD/<original-subdir>/<filename> */
function trashDest(uploadDir: string, fileUrl: string, now: Date): string {
  const dateStr = now.toISOString().slice(0, 10);
  // url вида /uploads/2026-09/filename.webp → относительный путь 2026-09/filename.webp
  const relative = fileUrl.replace(/^\/uploads\//, "");
  return path.join(uploadDir, "_trash", dateStr, relative);
}

/**
 * Удаляет файлы из тома uploads, на которые нет ссылок, — перемещая их в корзину.
 * Источники ссылок: Category.image, Service.image/bannerImage/content, Master.photo,
 * Banner.image, Attachment.url, Page.body, Task.mockupUrl, Setting (все поля),
 * LibraryVersion.content (текст Канона), docs/IMAGES.md.
 */
export async function cleanUnusedImages(now: Date): Promise<{ deleted: number; errors: number }> {
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || "./data/uploads");
  const cutoff = new Date(now.getTime() - 7 * 24 * 3600_000);

  const [categories, services, masters, banners, attachments, pages, tasks, settings, libraryVersions] = await Promise.all([
    db.category.findMany({ select: { image: true } }),
    db.service.findMany({ select: { image: true, bannerImage: true, content: true } }),
    db.master.findMany({ select: { photo: true } }),
    db.banner.findMany({ select: { image: true } }),
    db.attachment.findMany({ select: { url: true } }),
    db.page.findMany({ select: { body: true } }),
    db.task.findMany({ select: { mockupUrl: true } }),
    db.setting.findMany({ select: { value: true } }),
    db.libraryVersion.findMany({ select: { content: true } }),
  ]);

  const usedUrls = new Set<string>();

  // Прямые поля с URL изображений
  for (const r of categories) if (r.image) usedUrls.add(r.image);
  for (const r of services) {
    if (r.image) usedUrls.add(r.image);
    if (r.bannerImage) usedUrls.add(r.bannerImage);
    for (const u of extractUploadUrls(r.content)) usedUrls.add(u);
  }
  for (const r of masters) if (r.photo) usedUrls.add(r.photo);
  for (const r of banners) if (r.image) usedUrls.add(r.image);
  for (const r of attachments) usedUrls.add(r.url);

  // JSON-поля и текстовые поля с вложенными URL
  for (const r of pages) for (const u of extractUploadUrls(r.body)) usedUrls.add(u);
  for (const r of tasks) if (r.mockupUrl) usedUrls.add(r.mockupUrl);
  for (const r of settings) for (const u of extractUploadUrls(r.value)) usedUrls.add(u);
  for (const r of libraryVersions) for (const u of extractUploadUrls(r.content)) usedUrls.add(u);

  // docs/IMAGES.md — нарочно загруженные файлы, ещё не подключённые в вёрстке
  try {
    const imagesDoc = await fs.readFile(path.resolve("./docs/IMAGES.md"), "utf-8");
    for (const u of extractUploadUrls(imagesDoc)) usedUrls.add(u);
  } catch {
    // файл недоступен в этом окружении — пропускаем без ошибки
  }

  // Сканируем папку загрузок, пропуская _trash
  const fileEntries: { url: string; path: string; mtime: Date }[] = [];
  let months: string[];
  try {
    months = await fs.readdir(uploadDir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { deleted: 0, errors: 0 };
    throw e;
  }

  for (const month of months) {
    if (month === "_trash") continue;
    const monthDir = path.join(uploadDir, month);
    let isDir = false;
    try {
      isDir = (await fs.stat(monthDir)).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    let names: string[];
    try {
      names = await fs.readdir(monthDir);
    } catch {
      continue;
    }

    for (const name of names) {
      const filePath = path.join(monthDir, name);
      try {
        const st = await fs.stat(filePath);
        if (!st.isFile()) continue;
        fileEntries.push({ url: `/uploads/${month}/${name}`, path: filePath, mtime: st.mtime });
      } catch {
        continue;
      }
    }
  }

  const toTrash = staleFiles(usedUrls, fileEntries, cutoff);
  let deleted = 0;
  let errors = 0;

  for (const f of toTrash) {
    const dest = trashDest(uploadDir, f.url, now);
    try {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.rename(f.path, dest);
      await db.auditLog.create({
        data: { action: "upload.trashed", entity: "Upload", entityId: f.url, data: { trashPath: dest } },
      });
      deleted++;
    } catch (e) {
      errors++;
      console.error(`[cleanup] не удалось переместить в корзину ${f.path}:`, e);
    }
  }

  console.log(`[cron] clean-images: перемещено в корзину ${deleted} файл(ов)${errors ? `, ошибок: ${errors}` : ""}`);
  return { deleted, errors };
}

/** Удаляет из корзины файлы, пролежавшие там дольше 30 дней */
export async function cleanTrash(now: Date): Promise<number> {
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || "./data/uploads");
  const trashDir = path.join(uploadDir, "_trash");

  let dateDirs: string[];
  try {
    dateDirs = await fs.readdir(trashDir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw e;
  }

  const cutoff = new Date(now.getTime() - 30 * 24 * 3600_000);
  let deleted = 0;

  for (const dateDir of dateDirs) {
    const dirDate = new Date(dateDir + "T00:00:00Z");
    if (isNaN(dirDate.getTime()) || dirDate >= cutoff) continue;
    const fullDir = path.join(trashDir, dateDir);
    try {
      await fs.rm(fullDir, { recursive: true });
      deleted++;
    } catch (e) {
      console.error(`[cleanup] не удалось очистить корзину ${fullDir}:`, e);
    }
  }

  if (deleted > 0) console.log(`[cron] clean-trash: удалено папок в корзине: ${deleted}`);
  return deleted;
}

/** Удаляет записи журнала действий сотрудников старше 6 месяцев (180 дней) */
export async function cleanOldAuditLogs(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - 180 * 24 * 3600_000);
  const { count } = await db.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  console.log(`[cron] clean-audit-log: удалено ${count} запис(ей)`);
  return count;
}
