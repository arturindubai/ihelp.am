/**
 * Названия и типы для бэклога Control Center.
 * Отдельный файл, чтобы интерфейс мог импортировать только словари, а не весь бэклог.
 */

export const EPICS = [
  "Каталог и цены",
  "Оформление заказа",
  "Подписки и пакеты",
  "Личный кабинет клиента",
  "Кабинет мастера",
  "Админка и роли",
  "Вход и безопасность",
  "Уведомления и рассылки",
  "Оплата",
  "Инфраструктура и эксплуатация",
  "Данные и бэкапы",
  "Мониторинг и аналитика",
  "SEO и присутствие",
  "Юридическое и персональные данные",
  "Контент и команда",
  "Разработка и процесс",
  "Маршруты и умное расписание",
  "Архитектура и качество",
] as const;

export const AREAS: Record<string, string> = {
  product: "Продукт",
  auth: "Вход",
  otp: "Каналы кода",
  notify: "Уведомления",
  pay: "Оплата",
  db: "Данные",
  infra: "Инфраструктура",
  mon: "Мониторинг",
  seo: "SEO",
  legal: "Юридическое",
  content: "Контент",
  team: "Команда",
  dev: "Разработка",
  route: "Маршруты",
  arch: "Архитектура",
};

export const LAYERS: Record<string, string> = { back: "Бэк", front: "Фронт", fullstack: "Бэк+Фронт", infra: "Инфра", none: "Не код" };
export const PRIORITIES: Record<string, string> = { p0: "До первых клиентов", p1: "До запуска", p2: "После запуска", p3: "К сведению" };
export const STAGES: Record<string, string> = { baseline: "Уже работает", launch: "1. Первые клиенты", public: "2. Публичный запуск", growth: "3. Рост", later: "4. Позже" };
export const STATUSES: Record<string, string> = { backlog: "Бэклог", in_progress: "В работе", review: "На проверке", blocked: "Заблокирована", done: "Готово" };
export const OWNERS: Record<string, string> = { product: "Продукт", tech: "Техника", both: "Продукт + техника" };

export interface TaskSeed {
  key: string;
  title: string;
  summary: string;
  details?: string;
  /** Критерии приёмки: по ним задача считается выполненной */
  requirements: string[];
  /** Что нужно от продукта: аккаунты, документы, решения */
  needs?: string[];
  depends?: string[];
  docs?: string[];
  epic: (typeof EPICS)[number];
  area: keyof typeof AREAS;
  layer: keyof typeof LAYERS;
  priority: keyof typeof PRIORITIES;
  stage: keyof typeof STAGES;
  owner: keyof typeof OWNERS;
  estimate?: "S" | "M" | "L";
  status?: keyof typeof STATUSES;
}
