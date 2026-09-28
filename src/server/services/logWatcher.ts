import "server-only";
import { db } from "../db";
import { recentErrorLines, makeFingerprint, isPageBuildError, scrub } from "../logbuffer";
import { intakeCreate } from "./ccBoard";
import { html, notifyTech } from "../notify";
import { ymd } from "@/lib/time";

const MAX_DAILY = 5;
const MIN_REPEATS = 3;
const ACTOR = "system:logwatcher";

type FpEntry = {
  intakeKey: string;
  lastNotifiedAt: string; // ISO
  totalCount: number;
};

type WatchState = {
  fingerprints: Record<string, FpEntry>;
  daily: { date: string; count: number; limitNotified: boolean };
};

function emptyState(): WatchState {
  return { fingerprints: {}, daily: { date: "", count: 0, limitNotified: false } };
}

async function loadState(): Promise<WatchState> {
  const row = await db.setting.findUnique({ where: { key: "_logwatch" } });
  if (!row) return emptyState();
  const v = row.value as Partial<WatchState>;
  return {
    fingerprints: v.fingerprints ?? {},
    daily: v.daily ?? { date: "", count: 0, limitNotified: false },
  };
}

async function saveState(state: WatchState): Promise<void> {
  await db.setting.upsert({
    where: { key: "_logwatch" },
    create: { key: "_logwatch", value: state as object },
    update: { value: state as object },
  });
}

/** Удаляем записи об отпечатках старше 7 дней, чтобы состояние не росло бесконечно */
function pruneFingerprints(state: WatchState): void {
  const cutoff = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  for (const fp of Object.keys(state.fingerprints)) {
    if (state.fingerprints[fp].lastNotifiedAt < cutoff) delete state.fingerprints[fp];
  }
}

export async function runLogWatcher(): Promise<{ created: number; updated: number; limited: boolean }> {
  const lines = recentErrorLines(60);
  if (!lines.length) return { created: 0, updated: 0, limited: false };

  // Группируем строки по отпечатку
  type Group = { lines: typeof lines; example: string };
  const groups = new Map<string, Group>();
  for (const line of lines) {
    const fp = makeFingerprint(line.text);
    if (!fp) continue;
    const g = groups.get(fp);
    if (g) g.lines.push(line);
    else groups.set(fp, { lines: [line], example: line.text });
  }

  const state = await loadState();

  // Сброс дневного счётчика в полночь по Еревану
  const today = ymd(new Date());
  if (state.daily.date !== today) {
    state.daily = { date: today, count: 0, limitNotified: false };
  }

  pruneFingerprints(state);

  let created = 0;
  let updated = 0;
  let limitedThisRun = false;

  for (const [fp, group] of groups) {
    const count = group.lines.length;
    const firstAt = group.lines.reduce((min, l) => (l.at < min ? l.at : min), group.lines[0].at);
    const lastAt = group.lines.reduce((max, l) => (l.at > max ? l.at : max), group.lines[0].at);
    const existing = state.fingerprints[fp];

    if (existing) {
      // Карточка уже есть: дописываем новые повторения
      const newLines = group.lines.filter((l) => l.at > existing.lastNotifiedAt);
      if (!newLines.length) continue;

      try {
        const task = await db.task.findUnique({
          where: { key: existing.intakeKey },
          select: { id: true, status: true },
        });
        if (!task || task.status === "done" || task.status === "cancelled") {
          // Карточка закрыта — забываем отпечаток, чтобы при необходимости создать новую
          delete state.fingerprints[fp];
          continue;
        }
        const note = `Повторений за последний час: ${count}. Новых с прошлой отметки: ${newLines.length}.\nПример:\n${scrub(group.example).slice(0, 400)}`;
        await db.taskComment.create({ data: { taskId: task.id, author: ACTOR, kind: "system", text: note } });
        existing.lastNotifiedAt = new Date().toISOString();
        existing.totalCount += newLines.length;
        updated++;
      } catch (e) {
        console.error("[logwatcher] ошибка при обновлении карточки", existing.intakeKey, e);
      }
      continue;
    }

    // Новый отпечаток: проверяем порог (3 раза за час или ошибка рендера страницы)
    const pageBuild = isPageBuildError(group.example);
    if (count < MIN_REPEATS && !pageBuild) continue;

    // Дневной лимит: не больше MAX_DAILY новых входящих от вотчера в сутки
    if (state.daily.count >= MAX_DAILY) {
      limitedThisRun = true;
      if (!state.daily.limitNotified) {
        const firstLine = scrub(group.example).split("\n")[0].slice(0, 100);
        await notifyTech(html`⚠️ <b>Лог-вотчер: превышен лимит входящих (${MAX_DAILY} в сутки)</b>\nСледующая ошибка не создаст карточку: <code>${firstLine}</code>`).catch(() => null);
        state.daily.limitNotified = true;
      }
      continue;
    }

    // Создаём входящую карточку IN-N
    try {
      const headline = scrub(group.example).split("\n")[0].slice(0, 180);
      const example = scrub(group.example).slice(0, 800);
      const whenPart = count > 1 ? `Первое: ${firstAt}\nПоследнее: ${lastAt}` : `Время: ${firstAt}`;
      const text = [
        `Ошибка в проде: ${headline}`,
        "",
        `Повторений за последний час: ${count}`,
        whenPart,
        pageBuild ? "[ошибка рендера страницы]" : "",
        "",
        "Пример:",
        example,
      ]
        .filter((l) => l !== undefined)
        .join("\n")
        .trim();

      const task = await intakeCreate(text, ACTOR);
      state.fingerprints[fp] = {
        intakeKey: task.key,
        lastNotifiedAt: new Date().toISOString(),
        totalCount: count,
      };
      state.daily.count++;
      created++;
    } catch (e) {
      console.error("[logwatcher] ошибка при создании карточки", e);
    }
  }

  await saveState(state);
  return { created, updated, limited: limitedThisRun };
}
