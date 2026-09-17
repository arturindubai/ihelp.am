/**
 * Стартовые данные: тарифная сетка регулярной уборки из файла
 * Yerevan_Cleaning_Unit_Economics_2026.xlsx (лист Tariffs), категории, демо-мастера, настройки.
 * Скрипт идемпотентный: существующие записи не перезаписываются.
 */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const t = (ru: string, en = "", am = "") => ({ ru, en, am });

const sched = (items: [string, string, string, number][]) => items.map(([icon, ru, en, minutes]) => ({ icon, title: t(ru, en), minutes }));

const DURATIONS: { h: number; price: number; hint?: [string, string]; schedule: [string, string, string, number][] }[] = [
  { h: 1, price: 9000, schedule: [["kitchen", "Кухня и посуда", "Kitchen & dishes", 20], ["bath", "Санузел", "Bathroom", 15], ["floor", "Пылесос и мытьё полов", "Vacuuming & mopping", 15], ["bed", "Спальня", "Bedroom", 10]] },
  { h: 1.5, price: 12500, hint: ["Для студии", "For a studio"], schedule: [["tidy", "Разбор и порядок", "Decluttering", 10], ["kitchen", "Кухня и посуда", "Kitchen & dishes", 20], ["bath", "Санузел", "Bathroom", 20], ["floor", "Пылесос и мытьё полов", "Vacuuming & mopping", 20], ["bed", "Спальня", "Bedroom", 10], ["balcony", "Балкон", "Balcony", 10]] },
  { h: 2, price: 16000, hint: ["Для 1-комнатной", "For 1 bedroom"], schedule: [["tidy", "Разбор и порядок", "Decluttering", 10], ["kitchen", "Кухня и посуда", "Kitchen & dishes", 30], ["bath", "Санузел", "Bathroom", 25], ["floor", "Пылесос и мытьё полов", "Vacuuming & mopping", 25], ["bed", "Спальня", "Bedroom", 20], ["balcony", "Балкон", "Balcony", 10]] },
  { h: 2.5, price: 19500, hint: ["Для 2-комнатной", "For 2 bedrooms"], schedule: [["tidy", "Разбор и порядок", "Decluttering", 10], ["kitchen", "Кухня и посуда", "Kitchen & dishes", 40], ["bath", "Санузлы", "Bathrooms", 35], ["floor", "Пылесос и мытьё полов", "Vacuuming & mopping", 30], ["bed", "Комнаты", "Rooms", 25], ["balcony", "Балкон", "Balcony", 10]] },
  { h: 3, price: 23000, hint: ["Для 3-комнатной", "For 3 bedrooms"], schedule: [["tidy", "Разбор и порядок", "Decluttering", 10], ["kitchen", "Кухня и посуда", "Kitchen & dishes", 40], ["bath", "Санузлы", "Bathrooms", 40], ["floor", "Пылесос и мытьё полов", "Vacuuming & mopping", 30], ["bed", "Комнаты", "Rooms", 30], ["dust", "Пыль", "Dusting", 15], ["balcony", "Балкон", "Balcony", 15]] },
  { h: 3.5, price: 26500, schedule: [["tidy", "Разбор и порядок", "Decluttering", 15], ["kitchen", "Кухня и посуда", "Kitchen & dishes", 45], ["bath", "Санузлы", "Bathrooms", 40], ["floor", "Пылесос и мытьё полов", "Vacuuming & mopping", 35], ["bed", "Комнаты", "Rooms", 30], ["dust", "Пыль", "Dusting", 20], ["laundry", "Складывание белья", "Folding clothes", 15], ["balcony", "Балкон", "Balcony", 10]] },
  { h: 4, price: 30000, schedule: [["tidy", "Разбор и порядок", "Decluttering", 15], ["kitchen", "Кухня и посуда", "Kitchen & dishes", 45], ["bath", "Санузлы", "Bathrooms", 40], ["floor", "Пылесос и мытьё полов", "Vacuuming & mopping", 35], ["bed", "Комнаты", "Rooms", 30], ["dust", "Пыль", "Dusting", 20], ["laundry", "Складывание белья", "Folding clothes", 15], ["balcony", "Балкон", "Balcony", 10], ["extra", "Дополнительные задачи", "Extra tasks", 30]] },
];

const HOURS = Object.fromEntries([1, 2, 3, 4, 5, 6].map((d) => [String(d), [["09:00", "19:00"]]]));

async function main() {
  // Настройки: владелец
  const ownerPhone = process.env.ADMIN_PHONE || "+37400000000";
  await db.user.upsert({ where: { phone: ownerPhone }, create: { phone: ownerPhone, role: "OWNER", name: "Owner" }, update: { role: "OWNER" } });

  // Демо-каталог заливается один раз. Seed выполняется при каждом деплое, и без флага
  // удалённые в админке демо-мастера, баннер, категории и страницы возвращались бы после обновления.
  const SEED_FLAG = "_seed";
  if ((await db.setting.findUnique({ where: { key: SEED_FLAG } })) || (await db.service.count())) {
    await db.setting.upsert({ where: { key: SEED_FLAG }, create: { key: SEED_FLAG, value: { at: new Date().toISOString() } }, update: {} });
    console.log("Seed: demo data already applied, skipped. Owner phone:", ownerPhone);
    return;
  }

  const cleaning = await db.category.upsert({
    where: { slug: "cleaning" },
    create: { slug: "cleaning", title: t("Уборка", "Cleaning", "Մաքրում"), description: t("Регулярная уборка квартир и домов", "Regular home cleaning"), image: "/img/cat-cleaning.svg", sort: 1 },
    update: {},
  });
  const soon: [string, string, string, string][] = [
    ["deep-cleaning", "Генеральная уборка", "Deep cleaning", "/img/cat-deep.svg"],
    ["upholstery", "Химчистка мебели", "Upholstery cleaning", "/img/cat-sofa.svg"],
    ["handyman", "Мастер на час", "Handyman", "/img/cat-handyman.svg"],
    ["after-renovation", "Уборка после ремонта", "After-renovation cleaning", "/img/cat-renovation.svg"],
  ];
  for (const [i, [slug, ru, en, image]] of soon.entries()) {
    await db.category.upsert({ where: { slug }, create: { slug, title: t(ru, en), image, sort: i + 2, comingSoon: true }, update: {} });
  }

  const exists = await db.service.findUnique({ where: { slug: "regular-cleaning" } });
  if (!exists) {
    await db.service.create({
      data: {
        slug: "regular-cleaning",
        categoryId: cleaning.id,
        title: t("Регулярная уборка", "Regular cleaning"),
        subtitle: t("Разово или по подписке — один и тот же мастер", "One-time or subscription — the same cleaner every visit"),
        description: t("Поддерживающая уборка квартиры или дома: кухня, санузлы, полы, пыль, порядок в комнатах.", "Maintenance cleaning: kitchen, bathrooms, floors, dusting and tidying up."),
        image: "/img/svc-regular.svg",
        bannerImage: "/img/banner-regular.svg",
        sort: 1,
        content: {
          note: { title: t("Обратите внимание"), body: t("Мастер работает только внутри помещения. Если нужны материалы — выберите вариант «С нашими материалами».") },
          benefits: [
            { icon: "user", title: t("Тот же мастер на каждом визите", "Same cleaner every visit") },
            { icon: "calendar", title: t("Перенос и пропуск визита бесплатно", "Free reschedule & skip") },
            { icon: "pause", title: t("Пауза подписки, когда вы в отъезде", "Pause while you're away") },
            { icon: "cash", title: t("Оплата наличными мастеру", "Pay cash to the cleaner") },
          ],
          howItWorks: [
            { title: t("Выберите длительность и частоту", "Choose duration and frequency"), body: t("Цена пересчитывается сразу", "Price updates instantly") },
            { title: t("Укажите адрес, дату и время", "Add address, date and time") },
            { title: t("Выберите мастера или доверьте выбор нам", "Pick a cleaner or let us choose") },
            { title: t("Мастер приезжает и наводит порядок", "The cleaner arrives and gets it done") },
          ],
          faq: [
            { q: t("Можно ли сменить мастера?", "Can I change my cleaner?"), a: t("Да. Напишите нам или выберите другого мастера при переносе визита.") },
            { q: t("Как отменить или перенести визит?", "How do I cancel or reschedule?"), a: t("В личном кабинете → Мои заказы. Бесплатно — не позднее чем за 24 часа до визита.") },
            { q: t("Что входит в материалы?", "What materials are included?"), a: t("Универсальные моющие средства, средство для санузла и стёкол, микрофибра, губки.") },
          ],
          policy: t("Отмена и перенос визита бесплатны не позднее чем за 24 часа. Подписку можно поставить на паузу или отменить в личном кабинете."),
        },
        groups: {
          create: [
            {
              title: t("Выберите длительность", "Select duration"),
              isDuration: true,
              sort: 1,
              options: {
                create: DURATIONS.map((d, i) => ({
                  title: t(`${String(d.h).replace(".", ",")} ч`, `${d.h} h`),
                  subtitle: d.hint ? t(d.hint[0], d.hint[1]) : undefined,
                  price: d.price,
                  durationMin: d.h * 60,
                  isDefault: d.h === 2,
                  badge: d.h === 2 ? t("Популярно", "Popular") : undefined,
                  schedule: sched(d.schedule),
                  sort: i,
                })),
              },
            },
            {
              title: t("Моющие средства", "Cleaning materials"),
              infoTitle: t("Что входит в материалы?", "What's included?"),
              infoBody: t("Универсальное средство для поверхностей, средство для санузла, для стёкол, для пола, салфетки из микрофибры, губки. Пылесос и швабру предоставляет клиент."),
              sort: 2,
              options: {
                create: [
                  { title: t("Без материалов", "Without materials"), subtitle: t("Используем ваши средства", "We use yours"), price: 0, discountable: false, isDefault: true, sort: 0 },
                  { title: t("С нашими материалами", "With our materials"), price: 1000, discountable: false, sort: 1 },
                ],
              },
            },
            {
              title: t("Дополнительно", "Add-ons"),
              type: "MULTI",
              required: false,
              active: false,
              sort: 3,
              options: {
                create: [
                  { title: t("Мытьё окон"), price: 0, durationMin: 30, discountable: false, sort: 0 },
                  { title: t("Внутри холодильника"), price: 0, durationMin: 30, discountable: false, sort: 1 },
                  { title: t("Внутри духовки"), price: 0, durationMin: 30, discountable: false, sort: 2 },
                  { title: t("Глажка"), price: 0, durationMin: 30, discountable: false, sort: 3 },
                ],
              },
            },
          ],
        },
        plans: {
          create: [
            { kind: "ONE_TIME", title: t("Разово", "One-time"), subtitle: t("Один визит", "Single visit"), discountPercent: 0, sort: 0, isDefault: true },
            { kind: "SUBSCRIPTION", title: t("Раз в месяц", "Monthly"), subtitle: t("Каждые 4 недели", "Every 4 weeks"), intervalDays: 28, discountPercent: 0, sort: 1 },
            { kind: "SUBSCRIPTION", title: t("2 раза в месяц", "Twice a month"), subtitle: t("Каждые 2 недели", "Every 2 weeks"), intervalDays: 14, discountPercent: 3, sort: 2 },
            { kind: "SUBSCRIPTION", title: t("Каждую неделю", "Weekly"), subtitle: t("Раз в неделю", "Once a week"), intervalDays: 7, discountPercent: 5, sort: 3, badge: t("Популярно", "Popular") },
            { kind: "SUBSCRIPTION", title: t("2+ раза в неделю", "2+ times a week"), subtitle: t("Вы выбираете дни", "You pick the days"), intervalDays: 7, visitsPerWeek: 2, discountPercent: 7, sort: 4, badge: t("Выгоднее всего", "Best value") },
            { kind: "PACKAGE", title: t("Пакет 4 визита", "4-visit pack"), subtitle: t("Использовать за 3 месяца", "Use within 3 months"), packageVisits: 4, validityDays: 90, discountPercent: 0, sort: 5 },
          ],
        },
      },
    });
  }

  const svc = await db.service.findUniqueOrThrow({ where: { slug: "regular-cleaning" } });
  const masters: [string, string, string, number, string[]][] = [
    ["anna", "Анна", "Anna", 5, ["ru", "hy"]],
    ["mariam", "Мариам", "Mariam", 3, ["hy", "ru"]],
    ["lusine", "Лусине", "Lusine", 7, ["hy", "ru", "en"]],
  ];
  for (const [i, [slug, ru, en, exp, langs]] of masters.entries()) {
    await db.master.upsert({
      where: { slug },
      create: {
        slug,
        name: t(ru, en),
        bio: t("Демо-профиль. Замените фото и описание в админке.", "Demo profile."),
        photo: `/img/master-${i + 1}.svg`,
        experienceYears: exp,
        languages: langs,
        workingHours: HOURS,
        sort: i,
        skills: { connect: [{ id: svc.id }] },
      },
      update: {},
    });
  }

  if (!(await db.banner.count())) {
    await db.banner.create({
      data: {
        title: t("−25% на первый визит", "−25% off your first visit"),
        subtitle: t("При подписке или пакете от 4 визитов", "With a subscription or 4+ visit pack"),
        link: "/s/regular-cleaning",
        bg: "#1c1917",
        sort: 0,
      },
    });
  }

  const pages: [string, string, string][] = [
    ["offer", "Публичная оферта", "Terms of service"],
    ["privacy", "Политика конфиденциальности", "Privacy policy"],
    ["cancellation", "Правила отмены и переноса", "Cancellation policy"],
  ];
  for (const [slug, ru, en] of pages) {
    await db.page.upsert({ where: { slug }, create: { slug, title: t(ru, en), body: t("Текст документа будет добавлен.", "Coming soon.") }, update: {} });
  }
  await db.setting.create({ data: { key: SEED_FLAG, value: { at: new Date().toISOString() } } });
  console.log("Seed done. Owner phone:", ownerPhone);
}

main().finally(() => db.$disconnect());
