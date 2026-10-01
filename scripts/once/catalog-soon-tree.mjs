#!/usr/bin/env node
/**
 * Однократный скрипт CONTENT-16: заводит дерево «Скоро»-услуг в каталоге.
 * Запуск (деплоер, из основной копии, после бэкапа):
 *   node scripts/once/catalog-soon-tree.mjs --dry-run   # посмотреть что будет
 *   node scripts/once/catalog-soon-tree.mjs             # применить
 *
 * Что делает:
 *   1. Создаёт категорию «Дезинсекция» (pest-control), если её нет.
 *   2. Для каждой из 30 услуг делает upsert по slug (пропускает уже существующую).
 *   3. Архивирует категорию «Химчистка мебели» (upholstery) — дубль deep-cleaning-furniture.
 *   4. Пишет записи в AuditLog.
 *
 * CONTENT-17 (разделы) ещё не выложена — sectionId не указываем; расставить в админке потом.
 */
import { PrismaClient } from "@prisma/client";

const DRY = process.argv.includes("--dry-run");
const db = new PrismaClient();
const t = (ru, en) => ({ ru, en, am: "" });

// ─── Новые категории ───────────────────────────────────────────────────────
const NEW_CATEGORIES = [
  { slug: "pest-control", title: t("Дезинсекция", "Pest control"), image: "/img/cat-pest.svg", sort: 10 },
];

// ─── Дерево услуг: categorySlug → services[] ──────────────────────────────
// Все новые услуги: active=true, comingSoon=true, без цен и опций.
// Картинка — null (заглушка); заменяется в админке после генерации в Higgsfield.
const TREE = [
  // ── Генеральная уборка (deep-cleaning) ──────────────────────────────────
  {
    categorySlug: "deep-cleaning",
    services: [
      {
        slug: "deep-cleaning-apartment",
        title: t("Генеральная уборка квартиры", "Deep apartment cleaning"),
        description: t(
          "Тщательная уборка каждого угла: кухня, санузлы, комнаты, балкон, плинтусы, внутри шкафов.",
          "Thorough cleaning of every corner: kitchen, bathrooms, rooms, balcony, skirting boards, inside cabinets."
        ),
        sort: 1,
      },
      {
        slug: "deep-cleaning-furniture",
        title: t("Чистка мягкой мебели", "Upholstery cleaning"),
        description: t(
          "Экстракционная чистка диванов, кресел и матрасов — выводим пятна и запах.",
          "Extraction cleaning of sofas, armchairs and mattresses — removing stains and odour."
        ),
        sort: 2,
      },
      {
        slug: "deep-cleaning-kitchen",
        title: t("Кухня", "Kitchen deep cleaning"),
        description: t(
          "Генеральная уборка кухни: плита, духовка, вытяжка, кафель, внутри шкафов.",
          "Deep kitchen cleaning: stove, oven, extractor hood, tiles, inside cabinets."
        ),
        sort: 3,
      },
      {
        slug: "deep-cleaning-bathroom",
        title: t("Ванная", "Bathroom deep cleaning"),
        description: t(
          "Устранение известкового налёта, чистка швов плитки, дезинфекция.",
          "Removing limescale, cleaning tile grout, disinfection."
        ),
        sort: 4,
      },
      {
        slug: "deep-cleaning-ac",
        title: t("Чистка кондиционера", "Air conditioner cleaning"),
        description: t(
          "Чистка фильтров, испарителя и корпуса — кондиционер работает лучше, воздух чище.",
          "Cleaning filters, evaporator and housing — the AC runs better and the air is fresher."
        ),
        sort: 5,
      },
      {
        slug: "deep-cleaning-balcony",
        title: t("Балкон и лоджия", "Balcony & loggia"),
        description: t(
          "Убираем грязь и пыль с балкона: плитка, стёкла, перила, стены.",
          "Cleaning dirt and dust from balcony or loggia: tiles, glass, railings, walls."
        ),
        sort: 6,
      },
    ],
  },

  // ── Мастер на час (handyman) ─────────────────────────────────────────────
  {
    categorySlug: "handyman",
    services: [
      {
        slug: "handyman-electrician",
        title: t("Электрик", "Electrician"),
        description: t(
          "Замена розеток и выключателей, монтаж светильников, устранение неисправностей электрики.",
          "Replacing sockets and switches, installing lighting fixtures, fixing electrical faults."
        ),
        sort: 1,
      },
      {
        slug: "handyman-plumber",
        title: t("Сантехник", "Plumber"),
        description: t(
          "Замена смесителей, устранение течи, установка сантехники.",
          "Replacing mixers, fixing leaks, installing plumbing fixtures."
        ),
        sort: 2,
      },
      {
        slug: "handyman-furniture",
        title: t("Сборка мебели", "Furniture assembly"),
        description: t(
          "Сборка мебели по инструкции производителя — аккуратно и быстро.",
          "Assembling furniture per manufacturer instructions — neatly and quickly."
        ),
        sort: 3,
      },
      {
        slug: "handyman-shelves-tv",
        title: t("Навес полок и ТВ", "Wall mounting: shelves & TV"),
        description: t(
          "Монтаж полок, телевизора, картин и зеркал — надёжно, с минимальными повреждениями стены.",
          "Mounting shelves, TVs, pictures and mirrors — securely, with minimal wall damage."
        ),
        sort: 4,
      },
    ],
  },

  // ── Переезд и грузчики (moving) ──────────────────────────────────────────
  {
    categorySlug: "moving",
    services: [
      {
        slug: "moving-apartment",
        title: t("Квартирный переезд", "Apartment moving"),
        description: t(
          "Переезд под ключ: вынесем вещи, загрузим машину, перевезём и занесём на новое место.",
          "Full-service apartment move: carry out, load, transport and bring in at the new address."
        ),
        sort: 1,
      },
      {
        slug: "moving-loaders",
        title: t("Грузчики почасово", "Hourly movers"),
        description: t(
          "Профессиональные грузчики на любое время — погрузка, выгрузка, перестановка мебели.",
          "Professional movers by the hour — loading, unloading, rearranging furniture."
        ),
        sort: 2,
      },
      {
        slug: "moving-packing",
        title: t("Упаковка вещей", "Packing service"),
        description: t(
          "Упакуем хрупкие вещи и мебель для переезда — профессионально, с упаковочными материалами.",
          "Packing fragile items and furniture for moving — professionally, with packing materials."
        ),
        sort: 3,
      },
      {
        slug: "moving-furniture",
        title: t("Разборка и сборка мебели", "Furniture disassembly & assembly"),
        description: t(
          "Аккуратная разборка мебели перед переездом и сборка на новом месте.",
          "Careful furniture disassembly before moving and reassembly at the new location."
        ),
        sort: 4,
      },
    ],
  },

  // ── Повар на дом (chef) ──────────────────────────────────────────────────
  {
    categorySlug: "chef",
    services: [
      {
        slug: "chef-day",
        title: t("Повар на день", "Personal chef for a day"),
        description: t(
          "Личный повар приготовит обед и ужин из ваших продуктов — разнообразное домашнее меню.",
          "A personal chef cooks lunch and dinner from your ingredients — varied home-cooked menu."
        ),
        sort: 1,
      },
      {
        slug: "chef-event",
        title: t("Повар на мероприятие", "Event chef"),
        description: t(
          "Горячее для вашего торжества: банкет, праздник, день рождения — на дому.",
          "Catering for your celebration: banquet, party, birthday — at home."
        ),
        sort: 2,
      },
      {
        slug: "chef-prep",
        title: t("Заготовки на неделю", "Weekly meal prep"),
        description: t(
          "Порционные заготовки на всю неделю — разогрел и поел, без ежедневной готовки.",
          "Portioned meal prep for the whole week — heat and eat, no daily cooking."
        ),
        sort: 3,
      },
    ],
  },

  // ── Массаж на дом (massage) ──────────────────────────────────────────────
  {
    categorySlug: "massage",
    services: [
      {
        slug: "massage-classic",
        title: t("Классический массаж", "Classic massage"),
        description: t(
          "Классический общий массаж тела — снимает усталость, улучшает кровообращение.",
          "Classic full-body massage — relieves fatigue and improves circulation."
        ),
        sort: 1,
      },
      {
        slug: "massage-relaxing",
        title: t("Расслабляющий массаж", "Relaxing massage"),
        description: t(
          "Мягкий массаж с ароматическими маслами — снимает напряжение и стресс.",
          "Gentle massage with aromatic oils — relieves tension and stress."
        ),
        sort: 2,
      },
      {
        slug: "massage-sport",
        title: t("Спортивный массаж", "Sports massage"),
        description: t(
          "Глубокая проработка мышц после тренировок — восстановление и профилактика травм.",
          "Deep muscle work after training — recovery and injury prevention."
        ),
        sort: 3,
      },
    ],
  },

  // ── Химчистка (dry-cleaning) ─────────────────────────────────────────────
  {
    categorySlug: "dry-cleaning",
    services: [
      {
        slug: "dry-cleaning-clothes",
        title: t("Одежда с доставкой", "Clothes with pickup & delivery"),
        description: t(
          "Профессиональная химчистка одежды с доставкой от двери до двери.",
          "Professional dry cleaning of clothes with door-to-door pickup and delivery."
        ),
        sort: 1,
      },
      {
        slug: "dry-cleaning-carpet",
        title: t("Ковры", "Carpet cleaning"),
        description: t(
          "Профессиональная чистка ковров — выводим пятна, убираем запахи, восстанавливаем ворс.",
          "Professional carpet cleaning — removing stains, eliminating odours, restoring pile."
        ),
        sort: 2,
      },
      {
        slug: "dry-cleaning-curtains",
        title: t("Шторы", "Curtain cleaning"),
        description: t(
          "Чистим шторы и тюль с доставкой или на месте — без снятия с карниза.",
          "Cleaning curtains and tulle with pickup or on-site — without removing from the rail."
        ),
        sort: 3,
      },
      {
        slug: "dry-cleaning-ironing",
        title: t("Глажка", "Ironing service"),
        description: t(
          "Профессиональная глажка: рубашки, платья, постельное бельё.",
          "Professional ironing: shirts, dresses, bed linen."
        ),
        sort: 4,
      },
    ],
  },

  // ── Уборка после ремонта (after-renovation) ──────────────────────────────
  {
    categorySlug: "after-renovation",
    services: [
      {
        slug: "after-renovation-cleaning",
        title: t("Уборка после ремонта", "Post-renovation cleaning"),
        description: t(
          "Убираем строительный мусор и пыль после ремонта — квартира становится пригодной для жизни.",
          "Removing construction debris and dust after renovation — making the apartment livable."
        ),
        sort: 1,
      },
    ],
  },

  // ── Уборка (cleaning, working) — добавляем «Скоро» ──────────────────────
  {
    categorySlug: "cleaning",
    services: [
      {
        slug: "cleaning-part-time",
        title: t("Помощница на часть дня", "Part-time cleaner"),
        description: t(
          "Помощница на несколько часов — посуда, стирка, уборка, мелкие поручения.",
          "A helper for a few hours — dishes, laundry, cleaning, small tasks."
        ),
        sort: 2,
      },
    ],
  },

  // ── Дезинсекция (pest-control, новая категория) ──────────────────────────
  {
    categorySlug: "pest-control",
    services: [
      {
        slug: "pest-control-cockroaches",
        title: t("Тараканы", "Cockroach treatment"),
        description: t(
          "Профессиональная обработка от тараканов — безопасные препараты, долгосрочный результат.",
          "Professional cockroach treatment — safe products, long-lasting results."
        ),
        sort: 1,
      },
      {
        slug: "pest-control-bedbugs",
        title: t("Клопы", "Bedbug treatment"),
        description: t(
          "Уничтожение клопов с гарантией — обработка комнат, мебели и скрытых поверхностей.",
          "Bedbug extermination with a guarantee — treating rooms, furniture and hidden surfaces."
        ),
        sort: 2,
      },
      {
        slug: "pest-control-ants",
        title: t("Муравьи", "Ant treatment"),
        description: t(
          "Обработка от муравьёв в квартире или доме — находим и уничтожаем колонию.",
          "Ant treatment in an apartment or house — locating and eliminating the colony."
        ),
        sort: 3,
      },
      {
        slug: "pest-control-rodents",
        title: t("Грызуны", "Rodent control"),
        description: t(
          "Дератизация: уничтожение мышей и крыс — профессиональные методы, безопасно для людей.",
          "Rodent control: eliminating mice and rats — professional methods, safe for people."
        ),
        sort: 4,
      },
    ],
  },
];

// ─── Категории к архивированию ─────────────────────────────────────────────
// upholstery (Химчистка мебели) — дубль услуги deep-cleaning-furniture
const ARCHIVE_SLUGS = ["upholstery"];

// ─── Главная функция ───────────────────────────────────────────────────────
async function main() {
  let catCreated = 0;
  let svcCreated = 0;
  let svcSkipped = 0;
  let catArchived = 0;

  if (DRY) console.log("=== DRY RUN — в базу ничего не пишется ===\n");

  // 1. Создаём новые категории (pest-control)
  for (const cat of NEW_CATEGORIES) {
    const exists = await db.category.findUnique({ where: { slug: cat.slug } });
    if (exists) {
      console.log(`[cat] пропускаем ${cat.slug} (уже есть)`);
    } else {
      console.log(`[cat] создаём ${cat.slug}: ${cat.title.ru} / ${cat.title.en}`);
      if (!DRY) {
        await db.category.create({
          data: {
            slug: cat.slug,
            title: cat.title,
            image: cat.image,
            sort: cat.sort,
            active: true,
            comingSoon: true,
          },
        });
        await db.auditLog.create({
          data: {
            action: "catalog_tree_create_category",
            entity: "Category",
            entityId: cat.slug,
            data: { slug: cat.slug, title: cat.title },
          },
        });
      }
      catCreated++;
    }
  }

  // 2. Создаём услуги — upsert по slug (пропускаем существующие)
  for (const group of TREE) {
    const category = await db.category.findUnique({ where: { slug: group.categorySlug } });
    if (!category) {
      console.error(`[ERROR] категория не найдена: ${group.categorySlug} — пропускаем её услуги`);
      continue;
    }
    for (const svc of group.services) {
      const exists = await db.service.findUnique({ where: { slug: svc.slug } });
      if (exists) {
        console.log(`[svc] пропускаем ${svc.slug} (уже есть)`);
        svcSkipped++;
        continue;
      }
      console.log(`[svc] создаём ${svc.slug}: ${svc.title.ru}`);
      if (!DRY) {
        const created = await db.service.create({
          data: {
            slug: svc.slug,
            categoryId: category.id,
            title: svc.title,
            description: svc.description,
            active: true,
            comingSoon: true,
            sort: svc.sort,
          },
        });
        await db.auditLog.create({
          data: {
            action: "catalog_tree_create_service",
            entity: "Service",
            entityId: created.id,
            data: {
              slug: svc.slug,
              categorySlug: group.categorySlug,
              title: svc.title,
            },
          },
        });
      }
      svcCreated++;
    }
  }

  // 3. Архивируем upholstery
  for (const slug of ARCHIVE_SLUGS) {
    const cat = await db.category.findUnique({ where: { slug } });
    if (!cat) {
      console.log(`[arch] категория ${slug} не найдена, пропускаем`);
      continue;
    }
    if (cat.archived) {
      console.log(`[arch] ${slug} уже в архиве`);
    } else {
      console.log(`[arch] архивируем категорию ${slug}: ${cat.title.ru}`);
      if (!DRY) {
        await db.category.update({ where: { slug }, data: { archived: true } });
        await db.auditLog.create({
          data: {
            action: "catalog_tree_archive_category",
            entity: "Category",
            entityId: slug,
            data: { slug, reason: "duplicate of service deep-cleaning-furniture" },
          },
        });
      }
      catArchived++;
    }
  }

  console.log(
    `\nИтог${DRY ? " (dry-run)" : ""}:` +
    `  категорий создано ${catCreated},` +
    `  услуг создано ${svcCreated},` +
    `  услуг пропущено ${svcSkipped},` +
    `  категорий архивировано ${catArchived}`
  );
  if (DRY) console.log("\nЗапустите без --dry-run, чтобы применить.");
}

main().catch(console.error).finally(() => db.$disconnect());
