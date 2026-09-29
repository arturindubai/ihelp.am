"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, type Role } from "@prisma/client";
import { db } from "../../db";
import { requireSection } from "../../admin";
import { audit } from "../../audit";
import { recalcRatings } from "../../services/catalog";
import { invalidateUiCache, saveSettingsSection, getSettings, SECRET_PATHS, type Settings } from "../../settings";
import { html, notifyTeam, notifyTech } from "../../notify";
import { envContacts } from "../../contacts";
import { sendMail, mailTemplate } from "../../services/mail";
import { registerTelegramWebhook } from "../../services/telegramBot";
import { telegramWebhookSecret } from "@/lib/telegramAuth";
import { normalizePhone } from "@/lib/phone";
import { normalizeEmail } from "@/lib/email";

const i18n = z.object({ ru: z.string().max(20000).optional(), en: z.string().max(20000).optional(), am: z.string().max(20000).optional() }).partial();
const J = (v: unknown) => (v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue));
const rAll = () => revalidatePath("/", "layout");

/* ───── Клиенты ───── */
const clientPatch = z.object({ blocked: z.boolean().optional(), adminNotes: z.string().max(2000).optional(), name: z.string().max(80).optional() }).strict();

/** Правка карточки клиента. Роль и телефон здесь менять нельзя: роли выдаются только в разделе «Сотрудники» */
export async function clientAction(userId: string, patch: unknown) {
  const u = await requireSection("clients");
  const parsed = clientPatch.safeParse(patch);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  await db.user.update({ where: { id: userId }, data: parsed.data });
  if (parsed.data.blocked) await db.session.deleteMany({ where: { userId } });
  await audit(u.id, "client.update", "User", userId, parsed.data);
  return { ok: true as const };
}

/* ───── Отзывы ───── */
const reviewPatch = z
  .object({ status: z.enum(["APPROVED", "REJECTED", "PENDING"]).optional(), reply: z.string().max(2000).optional(), text: z.string().max(2000).optional(), rating: z.number().int().min(1).max(5).optional() })
  .strict();

export async function reviewModerateAction(id: string, patch: unknown) {
  const u = await requireSection("reviews");
  const parsed = reviewPatch.safeParse(patch);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  const r = await db.review.update({ where: { id }, data: parsed.data });
  await recalcRatings(r.masterId, r.serviceId);
  await audit(u.id, "review.update", "Review", id, parsed.data);
  rAll();
  return { ok: true };
}

export async function reviewDeleteAction(id: string) {
  const u = await requireSection("reviews");
  const r = await db.review.delete({ where: { id } });
  await recalcRatings(r.masterId, r.serviceId);
  await audit(u.id, "review.delete", "Review", id);
  rAll();
  return { ok: true };
}

export async function reviewCreateAction(input: { masterId: string | null; serviceId: string | null; authorName: string; rating: number; text: string }) {
  const u = await requireSection("reviews");
  const r = await db.review.create({ data: { masterId: input.masterId, serviceId: input.serviceId, authorName: input.authorName.slice(0, 80), rating: Math.min(5, Math.max(1, Math.round(input.rating))), text: input.text.slice(0, 2000), status: "APPROVED" } });
  await recalcRatings(r.masterId, r.serviceId);
  await audit(u.id, "review.create", "Review", r.id);
  rAll();
  return { ok: true };
}

/* ───── Промокоды ───── */
const promoSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,40}$/),
  description: z.string().max(300).nullable().optional(),
  type: z.enum(["PERCENT", "FIXED"]),
  value: z.number().int().min(1).max(10_000_000),
  maxDiscount: z.number().int().min(0).nullable(),
  minOrder: z.number().int().min(0).nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  usageLimit: z.number().int().min(1).nullable(),
  perUserLimit: z.number().int().min(1).max(1000),
  firstOrderOnly: z.boolean(),
  stackable: z.boolean(),
  serviceIds: z.array(z.string()),
  planKinds: z.array(z.enum(["ONE_TIME", "SUBSCRIPTION", "PACKAGE"])),
  active: z.boolean(),
});
export type PromoPayload = z.infer<typeof promoSchema>;

export async function savePromoAction(id: string | null, input: PromoPayload) {
  const u = await requireSection("promos");
  const p = promoSchema.safeParse(input);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.path.join(".") };
  const d = p.data;
  if (d.type === "PERCENT" && d.value > 100) return { ok: false as const, error: "value" };
  const data = { ...d, validFrom: d.validFrom ? new Date(`${d.validFrom}T00:00:00+04:00`) : null, validTo: d.validTo ? new Date(`${d.validTo}T23:59:59+04:00`) : null };
  try {
    const r = id ? await db.promoCode.update({ where: { id }, data }) : await db.promoCode.create({ data });
    await audit(u.id, id ? "promo.update" : "promo.create", "PromoCode", r.id, { code: d.code });
    return { ok: true as const, id: r.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false as const, error: "code" };
    throw e;
  }
}

export async function deletePromoAction(id: string) {
  const u = await requireSection("promos");
  const used = await db.promoRedemption.count({ where: { promoId: id } });
  if (used) await db.promoCode.update({ where: { id }, data: { active: false } });
  else await db.promoCode.delete({ where: { id } });
  await audit(u.id, used ? "promo.archive" : "promo.delete", "PromoCode", id);
  return { ok: true, archived: !!used };
}

/* ───── Баннеры ───── */
const PLACEMENTS = ["CAROUSEL_HOME", "HERO_HOME", "CATALOG", "SERVICE", "CHECKOUT", "SUCCESS", "EMAIL", "CLIENT_CABINET", "MASTER_CABINET"] as const;
const BANNER_TYPES = ["PROMO", "ANNOUNCEMENT", "UPSELL", "CROSS_SELL"] as const;
const AUDIENCES = ["ALL", "LOGGED_IN", "GUESTS"] as const;
const SEGMENTS = ["ALL", "NEW", "RETURNING"] as const;

const bannerSchema = z.object({
  title: i18n,
  subtitle: i18n.nullable().optional(),
  image: z.string().max(500).nullable().optional(),
  link: z.string().max(300).nullable().optional(),
  promoCode: z.string().max(40).nullable().optional(),
  bg: z.string().max(20).nullable().optional(),
  active: z.boolean(),
  sort: z.number().int(),
  placement: z.enum(PLACEMENTS).default("CAROUSEL_HOME"),
  bannerType: z.enum(BANNER_TYPES).default("PROMO"),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  audience: z.enum(AUDIENCES).default("ALL"),
  segment: z.enum(SEGMENTS).default("ALL"),
});
export type BannerPayload = z.infer<typeof bannerSchema>;

export async function saveBannerAction(id: string | null, input: BannerPayload) {
  const u = await requireSection("banners");
  const p = bannerSchema.safeParse(input);
  if (!p.success) return { ok: false };
  // "YYYY-MM-DDTHH:mm" (datetime-local) интерпретируем как Ереван UTC+4; ISO строки из БД тоже принимаем
  const parseDate = (s: string | null | undefined): Date | null | "invalid" => {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return new Date(`${s}:00+04:00`);
    const d = new Date(s);
    return isNaN(d.getTime()) ? "invalid" : d;
  };
  const startsAt = parseDate(p.data.startsAt);
  const endsAt = parseDate(p.data.endsAt);
  if (startsAt === "invalid") return { ok: false as const, error: "startsAt" };
  if (endsAt === "invalid") return { ok: false as const, error: "endsAt" };
  const d = {
    ...p.data,
    subtitle: J(p.data.subtitle),
    startsAt,
    endsAt,
  };
  const r = id ? await db.banner.update({ where: { id }, data: d }) : await db.banner.create({ data: d });
  await audit(u.id, "banner.save", "Banner", r.id);
  rAll();
  return { ok: true };
}

export async function deleteBannerAction(id: string) {
  const u = await requireSection("banners");
  await db.banner.delete({ where: { id } });
  await audit(u.id, "banner.delete", "Banner", id);
  rAll();
  return { ok: true };
}

/* ───── Страницы ───── */
export async function savePageAction(id: string | null, input: { slug: string; title: z.infer<typeof i18n>; body: z.infer<typeof i18n>; active: boolean }) {
  const u = await requireSection("pages");
  const p = z.object({ slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,60}$/), title: i18n, body: i18n, active: z.boolean() }).safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" };
  try {
    const r = id ? await db.page.update({ where: { id }, data: p.data }) : await db.page.create({ data: p.data });
    await audit(u.id, "page.save", "Page", r.id, { slug: p.data.slug });
    rAll();
    return { ok: true as const, id: r.id };
  } catch {
    return { ok: false as const, error: "slug" };
  }
}

export async function deletePageAction(id: string) {
  const u = await requireSection("pages");
  await db.page.delete({ where: { id } });
  await audit(u.id, "page.delete", "Page", id);
  rAll();
  return { ok: true };
}

/* ───── Обещания (SiteFeature) ───── */
const featureSchema = z.object({ icon: z.string().max(30), title: i18n, body: i18n.nullable().optional(), active: z.boolean(), sort: z.number().int() });
export type FeaturePayload = z.infer<typeof featureSchema>;

export async function saveFeatureAction(id: string | null, input: FeaturePayload) {
  const u = await requireSection("content");
  const p = featureSchema.safeParse(input);
  if (!p.success) return { ok: false };
  const d = { ...p.data, body: p.data.body ?? Prisma.DbNull };
  const r = id ? await db.siteFeature.update({ where: { id }, data: d }) : await db.siteFeature.create({ data: d });
  await audit(u.id, "feature.save", "SiteFeature", r.id);
  rAll();
  return { ok: true };
}

export async function deleteFeatureAction(id: string) {
  const u = await requireSection("content");
  await db.siteFeature.delete({ where: { id } });
  await audit(u.id, "feature.delete", "SiteFeature", id);
  rAll();
  return { ok: true };
}

/* ───── FAQ (SiteFaq) ───── */
const faqSchema = z.object({ q: i18n, a: i18n, active: z.boolean(), sort: z.number().int() });
export type FaqPayload = z.infer<typeof faqSchema>;

export async function saveFaqAction(id: string | null, input: FaqPayload) {
  const u = await requireSection("content");
  const p = faqSchema.safeParse(input);
  if (!p.success) return { ok: false };
  const r = id ? await db.siteFaq.update({ where: { id }, data: p.data }) : await db.siteFaq.create({ data: p.data });
  await audit(u.id, "faq.save", "SiteFaq", r.id);
  rAll();
  return { ok: true };
}

export async function deleteFaqAction(id: string) {
  const u = await requireSection("content");
  await db.siteFaq.delete({ where: { id } });
  await audit(u.id, "faq.delete", "SiteFaq", id);
  rAll();
  return { ok: true };
}

/* ───── Тексты интерфейса ───── */
export async function saveUiStringAction(locale: string, key: string, value: string) {
  const u = await requireSection("translations");
  if (!["ru", "en", "am"].includes(locale) || !/^[\w.]+$/.test(key)) return { ok: false };
  if (!value.trim()) await db.uiString.deleteMany({ where: { locale, key } });
  else await db.uiString.upsert({ where: { locale_key: { locale, key } }, create: { locale, key, value }, update: { value } });
  invalidateUiCache();
  await audit(u.id, "ui.save", "UiString", `${locale}:${key}`);
  rAll();
  return { ok: true };
}

/* ───── Настройки ───── */

const SETTING_KEYS = ["brand", "locales", "booking", "pricing", "payments", "otp", "notify", "google", "apple", "mail"] as const;

export async function saveSettingsAction<K extends keyof Settings>(key: K, value: Settings[K]) {
  const u = await requireSection("settings");
  // Ключ раздела приходит из браузера: принимаем только известные, иначе можно записать служебные отметки
  if (!(SETTING_KEYS as readonly string[]).includes(key as string)) return { ok: false as const, error: "invalid" };
  if (value == null || typeof value !== "object" || Array.isArray(value)) return { ok: false as const, error: "invalid" };
  const current = await getSettings();
  const next = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  // Секреты: если пришло маскированное значение — оставляем сохранённое
  for (const path of SECRET_PATHS) {
    const [root, ...rest] = path.split(".");
    if (root !== key) continue;
    let n: Record<string, unknown> = next, c: Record<string, unknown> = current[key] as unknown as Record<string, unknown>;
    for (let i = 0; i < rest.length - 1; i++) { n = n[rest[i]] as Record<string, unknown>; c = c[rest[i]] as Record<string, unknown>; }
    const last = rest[rest.length - 1];
    if (typeof n[last] === "string" && (n[last] as string).includes("••••")) n[last] = c[last];
  }
  if (key === "brand") {
    // Контакты из .env в базу не пишем — иначе после очистки .env всплывут старые значения
    for (const k of Object.keys(envContacts())) delete next[k];
  }
  if (key === "locales") {
    const l = next as { enabled: string[] };
    l.enabled = ["ru", ...l.enabled.filter((x) => x !== "ru" && ["en", "am"].includes(x))];
  }
  await saveSettingsSection(key, next as unknown as Settings[K]);
  await audit(u.id, "settings.save", "Setting", key);
  rAll();
  return { ok: true };
}

export async function testNotifyAction() {
  await requireSection("settings");
  const s = await getSettings();
  const threadLabel = s.notify.telegramOrderThreadId ? ` (топик ${s.notify.telegramOrderThreadId})` : "";
  await notifyTeam(`✅ Тестовое уведомление${threadLabel}`);
  const techLabel = s.notify.telegramTechThreadId ? ` (тех-топик ${s.notify.telegramTechThreadId})` : "";
  await notifyTech(`✅ Тестовое уведомление (тех-алерт)${techLabel}`);
  const token = s.team.botToken || s.notify.telegramBotToken;
  const teamChat = s.notify.teamChatId || s.notify.telegramChatId;
  const techSeparate = !!s.notify.techChatId;
  return {
    ok: true as const,
    teamConfigured: !!(token && teamChat),
    techConfigured: !!(token && (s.notify.techChatId || teamChat)),
    techSeparate,
  };
}

/** Подключить вход через Telegram-бота (AUTH-10): регистрирует вебхук на текущем APP_URL */
export async function registerTelegramWebhookAction() {
  const u = await requireSection("settings");
  const appUrl = process.env.APP_URL;
  if (!appUrl || !appUrl.startsWith("https://")) return { ok: false as const, error: "https" };
  const secret = telegramWebhookSecret(process.env.SESSION_SECRET || "dev");
  const r = await registerTelegramWebhook(appUrl, secret);
  if (!r.ok) return { ok: false as const, error: "telegram" };
  // Имя бота нужно сайту для кнопки «Войти через Telegram»: без подключённого вебхука кнопки нет
  if (r.username) await saveSettingsSection("notify", { ...(await getSettings()).notify, telegramBotUsername: r.username });
  await audit(u.id, "settings.telegramWebhook", "Setting", "notify");
  return { ok: true as const, username: r.username };
}

/* ───── Сотрудники ───── */
export async function testMailAction(to: string) {
  const u = await requireSection("settings");
  const s = await getSettings();
  const address = (to || "").trim() || s.brand.email;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return { ok: false as const, error: "email" };
  const r = await sendMail({
    to: address,
    subject: `${s.brand.name}: тестовое письмо`,
    html: mailTemplate({
      brand: s.brand.name,
      title: "Почта подключена",
      lines: ["Это тестовое письмо из админки. Если вы его видите, отправка писем работает."],
      button: process.env.APP_URL ? { text: "Открыть сайт", url: process.env.APP_URL } : undefined,
    }),
    text: "Это тестовое письмо из админки. Отправка писем работает.",
  });
  await audit(u.id, "mail.test", "Setting", "mail", { to: address, ok: r.ok });
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}

export async function setRoleAction(phoneRaw: string, role: Role, name?: string) {
  const u = await requireSection("staff");
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { ok: false as const, error: "phone" };

  const target = await db.user.findUnique({ where: { phone }, select: { id: true, role: true } });
  if (target?.role === "OWNER") {
    // Вариант А: роль другого владельца менять нельзя
    if (phone !== u.phone) return { ok: false as const, error: "cannotRemoveOwner" };
    // Последнего владельца нельзя понизить ни при каком варианте
    const ownerCount = await db.user.count({ where: { role: "OWNER" } });
    if (ownerCount <= 1) return { ok: false as const, error: "lastOwner" };
  } else {
    if (phone === u.phone && role !== "OWNER") return { ok: false as const, error: "self" };
  }

  const namePatch = name ? { name } : {};
  const r = await db.user.upsert({ where: { phone }, create: { phone, role, ...namePatch }, update: { role, ...namePatch } });
  if (role === "CLIENT") await db.session.deleteMany({ where: { userId: r.id } });
  await audit(u.id, "staff.role", "User", r.id, { role });
  // Тех-алерт при изменении роли владельца (понижение или повышение)
  if (target?.role === "OWNER" || role === "OWNER") {
    await notifyTech(html`⚠️ Смена роли владельца: <b>${r.id}</b> → <code>${role}</code> (оператор: <b>${u.name || u.id}</b>)`);
  }
  return { ok: true as const };
}

/** Владелец задаёт или меняет email сотрудника. Адрес, заданный администратором, считается подтверждённым. */
export async function setStaffEmailAction(phoneRaw: string, emailRaw: string | null) {
  const u = await requireSection("staff");
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { ok: false as const, error: "phone" };
  const email = emailRaw ? normalizeEmail(emailRaw) : null;
  if (emailRaw && !email) return { ok: false as const, error: "email" };
  const target = await db.user.findUnique({ where: { phone } });
  if (!target) return { ok: false as const, error: "notfound" };
  try {
    await db.user.update({ where: { id: target.id }, data: { email, emailVerifiedAt: email ? new Date() : null } });
    await audit(u.id, "staff.email", "User", target.id, { action: email ? "set" : "clear" });
    return { ok: true as const };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false as const, error: "email_taken" };
    throw e;
  }
}
