/**
 * Дорожки и этапы потока бэклога Control Center — по образцу Command Center LIA.
 * Дорожка — кто исполняет задачу (бизнес, разработка, продукт…), этап потока — где задача сейчас
 * в конвейере «триаж → очередь → работа → тест → деплоер». Дорожка хранится явно в Task.track;
 * если не задана — вычисляется по trackDefault из ключа, слоя, области и владельца.
 */

export const TRACKS = ["business", "dev", "product", "design", "bugs", "inbox"] as const;
export type Track = (typeof TRACKS)[number];

/** Алиас для совместимости: во всём коде lane === track */
export const LANES = TRACKS;
export type Lane = Track;

/** Префиксы ключей, которые идут в дорожку «Ошибки и аудит» */
const BUG_PREFIXES = ["AUD", "RISK", "BUG"];

/** Области, которые всегда идут в «Бизнес» независимо от слоя */
const BIZ_AREAS = ["legal", "pay", "team", "seo"];

type LaneShape = { key: string; layer: string; area?: string; owner?: string; track?: string | null; source?: string | null };

/**
 * Дорожка задачи: если явное значение сохранено в Task.track — берём его,
 * иначе вычисляем по умолчанию.
 */
export function laneOf(t: LaneShape): Track {
  if (t.track && (TRACKS as readonly string[]).includes(t.track)) return t.track as Track;
  return trackDefault(t);
}

/**
 * Правило умолчания для дорожки (используется при первичном назначении триажем
 * и в скрипте миграции set-tracks.mjs):
 *   prefix IN / source=intake → inbox
 *   BUG/AUD/RISK             → bugs
 *   DSN                      → design
 *   area legal/pay/team/seo
 *   или layer=none, owner=product → business
 *   layer=none, owner=tech        → product
 *   иначе                         → dev (включает старую infra)
 */
export function trackDefault(t: Omit<LaneShape, "track">): Track {
  const prefix = t.key.split("-")[0];
  if (prefix === "IN" || t.source === "intake") return "inbox";
  if (BUG_PREFIXES.includes(prefix)) return "bugs";
  if (prefix === "DSN") return "design";
  if (BIZ_AREAS.includes(t.area ?? "")) return "business";
  if (t.layer === "none" && t.owner === "product") return "business";
  if (t.layer === "none" && t.owner === "tech") return "product";
  return "dev";
}

/** Этапы потока в порядке конвейера: так они идут в фильтре и в виде «по этапу» */
export const FLOWS = ["triage", "owner", "deployer", "testing", "working", "queued", "blocked", "backlog", "done", "cancelled"] as const;
export type Flow = (typeof FLOWS)[number];

type FlowShape = {
  status: string;
  layer: string;
  blockedOn?: string | null;
  triagedAt?: Date | string | null;
  testedSha?: string | null;
};

/**
 * Этап потока задачи. tested — проверка тестировщика относится к текущему коммиту ветки
 * (его знает диспетчер); без этого знания достаточно отметки testedSha.
 */
export function flowOf(t: FlowShape, tested?: boolean): Flow {
  switch (t.status) {
    case "done":
      return "done";
    case "cancelled":
      return "cancelled";
    case "in_progress":
      return "working";
    case "ready":
      return "queued";
    case "review":
      // Не-код принимает человек («Согласования»), код — тестировщик, потом деплоер
      if (t.layer === "none") return "owner";
      return (tested ?? !!t.testedSha) ? "deployer" : "testing";
    case "blocked":
      return t.blockedOn === "owner" || t.blockedOn === "product" ? "owner" : "blocked";
    default:
      return t.triagedAt ? "backlog" : "triage";
  }
}

export const SIZES = ["S", "M", "L", "none"] as const;
export const sizeOf = (estimate: string | null | undefined) => (estimate && ["S", "M", "L"].includes(estimate) ? estimate : "none");

/** Счётчики по ключу: для чипов дорожек и этапов */
export function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Неделя по Еревану (понедельник 00:00, UTC+4) — для группировки релизов */
export function weekStart(d: Date): Date {
  const local = new Date(d.getTime() + 4 * 3600_000);
  const day = (local.getUTCDay() + 6) % 7;
  const monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - day);
  return new Date(monday - 4 * 3600_000);
}

/** Следующий свободный ключ входящей задачи: IN-1, IN-2… */
export function nextIntakeKey(existing: string[]): string {
  const max = existing.reduce((m, k) => {
    const n = Number(/^IN-(\d+)$/.exec(k)?.[1] ?? 0);
    return n > m ? n : m;
  }, 0);
  return `IN-${max + 1}`;
}

/** Заголовок карточки из свободного текста: первая строка, без лишних пробелов, не длиннее 120 знаков */
export function intakeTitle(text: string): string {
  const first = text.trim().split(/\r?\n/)[0].replace(/\s+/g, " ").trim();
  const title = first.length > 120 ? `${first.slice(0, 117).trimEnd()}…` : first;
  return title.length >= 5 ? title : `Входящее: ${title}`.slice(0, 120);
}
