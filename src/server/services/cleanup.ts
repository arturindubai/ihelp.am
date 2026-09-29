import "server-only";
import fs from "fs/promises";
import path from "path";
import { db } from "../db";
import { staleFiles } from "@/lib/cleanup";

/** Удаляет файлы из тома uploads, на которые нет ссылок в базе и которые старше 7 дней */
export async function cleanUnusedImages(now: Date): Promise<{ deleted: number; errors: number }> {
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || "./data/uploads");
  const cutoff = new Date(now.getTime() - 7 * 24 * 3600_000);

  const [categories, services, masters, banners, attachments] = await Promise.all([
    db.category.findMany({ select: { image: true } }),
    db.service.findMany({ select: { image: true, bannerImage: true } }),
    db.master.findMany({ select: { photo: true } }),
    db.banner.findMany({ select: { image: true } }),
    db.attachment.findMany({ select: { url: true } }),
  ]);

  const usedUrls = new Set<string>();
  for (const r of categories) if (r.image) usedUrls.add(r.image);
  for (const r of services) {
    if (r.image) usedUrls.add(r.image);
    if (r.bannerImage) usedUrls.add(r.bannerImage);
  }
  for (const r of masters) if (r.photo) usedUrls.add(r.photo);
  for (const r of banners) if (r.image) usedUrls.add(r.image);
  for (const r of attachments) usedUrls.add(r.url);

  const fileEntries: { url: string; path: string; mtime: Date }[] = [];

  let months: string[];
  try {
    months = await fs.readdir(uploadDir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { deleted: 0, errors: 0 };
    throw e;
  }

  for (const month of months) {
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

  const toDelete = staleFiles(usedUrls, fileEntries, cutoff);
  let deleted = 0;
  let errors = 0;
  for (const f of toDelete) {
    try {
      await fs.unlink(f.path);
      deleted++;
    } catch (e) {
      errors++;
      console.error(`[cleanup] не удалось удалить ${f.path}:`, e);
    }
  }

  console.log(`[cron] clean-images: удалено ${deleted} файл(ов)${errors ? `, ошибок: ${errors}` : ""}`);
  return { deleted, errors };
}

/** Удаляет записи журнала действий сотрудников старше 6 месяцев (180 дней) */
export async function cleanOldAuditLogs(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - 180 * 24 * 3600_000);
  const { count } = await db.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  console.log(`[cron] clean-audit-log: удалено ${count} запис(ей)`);
  return count;
}
