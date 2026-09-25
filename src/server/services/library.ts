import "server-only";
import crypto from "crypto";
import { db } from "../db";
import { LIBRARY_KINDS, titleOf } from "@/lib/library";

/**
 * Библиотека знаний и инструкций — Control Center → «Библиотека» (как Canon в админке LIA).
 * Документы репозитория снимаются сюда при каждой выкладке (prisma/seed.ts → syncRepoDocs): изменившийся
 * документ получает новую версию. Записи владельца и команды ведутся здесь же. Версии не удаляются — это и бэкап
 */

export const contentHash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export class LibraryError extends Error {}

export async function listLibrary(f: { q?: string; kind?: string; archived?: boolean } = {}) {
  const docs = await db.libraryDoc.findMany({
    where: { archived: f.archived ?? false, ...(f.kind && (LIBRARY_KINDS as readonly string[]).includes(f.kind) ? { kind: f.kind } : {}) },
    orderBy: [{ kind: "asc" }, { title: "asc" }],
    include: { versions: { orderBy: { n: "desc" }, take: 1, select: { content: true, author: true, createdAt: true } } },
  });
  const q = f.q?.trim().toLowerCase();
  const rows = docs
    .map((d) => ({ slug: d.slug, title: d.title, kind: d.kind, source: d.source, path: d.path, version: d.version, archived: d.archived, updatedAt: d.versions[0]?.createdAt ?? d.updatedAt, author: d.versions[0]?.author ?? d.createdBy, content: d.versions[0]?.content ?? "" }))
    .filter((d) => !q || d.title.toLowerCase().includes(q) || d.slug.toLowerCase().includes(q) || d.content.toLowerCase().includes(q));
  return rows.map(({ content, ...d }) => ({ ...d, size: content.length, hit: q && !d.title.toLowerCase().includes(q) ? snippet(content, q) : null }));
}

/** Кусок текста вокруг найденного слова — чтобы в списке было видно, почему документ нашёлся */
function snippet(content: string, q: string) {
  const i = content.toLowerCase().indexOf(q);
  if (i < 0) return null;
  const from = Math.max(0, i - 50);
  return `${from > 0 ? "…" : ""}${content.slice(from, i + q.length + 70).replace(/\s+/g, " ")}…`;
}

export async function libraryCounts() {
  const rows = await db.libraryDoc.groupBy({ by: ["kind"], where: { archived: false }, _count: true });
  return Object.fromEntries(rows.map((r) => [r.kind, r._count])) as Record<string, number>;
}

/** Документ с версиями: выбранная версия (по умолчанию текущая) и, для сравнения, другая */
export async function getLibraryDoc(slug: string, n?: number, compareTo?: number) {
  const doc = await db.libraryDoc.findUnique({
    where: { slug },
    include: { versions: { orderBy: { n: "desc" }, select: { id: true, n: true, title: true, author: true, note: true, createdAt: true, hash: true } } },
  });
  if (!doc) return null;
  const want = n && doc.versions.some((v) => v.n === n) ? n : doc.version;
  const [current, other] = await Promise.all([
    db.libraryVersion.findUnique({ where: { docId_n: { docId: doc.id, n: want } } }),
    compareTo ? db.libraryVersion.findUnique({ where: { docId_n: { docId: doc.id, n: compareTo } } }) : null,
  ]);
  return { doc, current, other };
}

async function addVersion(docId: string, n: number, title: string, content: string, author: string, note?: string | null) {
  await db.$transaction([
    db.libraryVersion.create({ data: { docId, n, title, content, hash: contentHash(content), author, note: note?.slice(0, 300) || null } }),
    db.libraryDoc.update({ where: { id: docId }, data: { version: n, title } }),
  ]);
}

export async function createNote(input: { title: string; kind: string; content: string }, author: string) {
  if (!(LIBRARY_KINDS as readonly string[]).includes(input.kind)) throw new LibraryError("bad_kind");
  const title = input.title.trim().slice(0, 200) || titleOf(input.content, "Запись");
  const slug = `note-${crypto.randomBytes(5).toString("hex")}`;
  const doc = await db.libraryDoc.create({ data: { slug, title, kind: input.kind, source: "admin", createdBy: author, version: 1 } });
  await db.libraryVersion.create({ data: { docId: doc.id, n: 1, title, content: input.content, hash: contentHash(input.content), author, note: "создано" } });
  return doc;
}

/** Правка записи — новая версия; тот же текст и заголовок — без новой версии. Документы репозитория правятся только через код */
export async function updateNote(slug: string, input: { title: string; content: string; note?: string }, author: string) {
  const doc = await db.libraryDoc.findUnique({ where: { slug }, include: { versions: { orderBy: { n: "desc" }, take: 1 } } });
  if (!doc) throw new LibraryError("not_found");
  if (doc.source !== "admin") throw new LibraryError("repo_doc");
  const title = input.title.trim().slice(0, 200) || doc.title;
  const last = doc.versions[0];
  if (last && last.hash === contentHash(input.content) && last.title === title) return { changed: false };
  await addVersion(doc.id, doc.version + 1, title, input.content, author, input.note);
  return { changed: true };
}

/** Вернуть прошлую версию записи: её текст становится новой версией, история сохраняется */
export async function restoreVersion(slug: string, n: number, author: string) {
  const doc = await db.libraryDoc.findUnique({ where: { slug } });
  if (!doc) throw new LibraryError("not_found");
  if (doc.source !== "admin") throw new LibraryError("repo_doc");
  const v = await db.libraryVersion.findUnique({ where: { docId_n: { docId: doc.id, n } } });
  if (!v) throw new LibraryError("not_found");
  await addVersion(doc.id, doc.version + 1, v.title, v.content, author, `возврат к версии ${n}`);
}

export async function setArchived(slug: string, archived: boolean) {
  const doc = await db.libraryDoc.findUnique({ where: { slug } });
  if (!doc) throw new LibraryError("not_found");
  if (doc.source !== "admin") throw new LibraryError("repo_doc");
  await db.libraryDoc.update({ where: { slug }, data: { archived } });
}
