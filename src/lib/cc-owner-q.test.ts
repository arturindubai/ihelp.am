import { describe, it, expect } from "vitest";
import { buildPostponeReason, classifyGroup, countOwnerCards, parseMultiQuestion, parseVariants } from "./cc-owner-q";

describe("parseVariants", () => {
  it("возвращает null если вариантов меньше двух", () => {
    expect(parseVariants("Просто текст")).toBeNull();
    expect(parseVariants("Вопрос? A) Только один вариант")).toBeNull();
  });

  it("парсит два варианта на одной строке", () => {
    const r = parseVariants("Выбрать подход? A) Быстрый B) Качественный");
    expect(r).not.toBeNull();
    expect(r!.question).toBe("Выбрать подход?");
    expect(r!.variants).toHaveLength(2);
    expect(r!.variants[0]).toEqual({ id: "A", text: "Быстрый" });
    expect(r!.variants[1]).toEqual({ id: "B", text: "Качественный" });
  });

  it("парсит три варианта", () => {
    const r = parseVariants("Канал входа? A) Telegram B) Email C) Оба");
    expect(r!.variants).toHaveLength(3);
    expect(r!.variants[2]).toEqual({ id: "C", text: "Оба" });
  });

  it("парсит варианты на разных строках", () => {
    const text = "Когда делать?\nA) Срочно сейчас\nB) В следующем спринте\nC) Отложить";
    const r = parseVariants(text);
    expect(r!.variants).toHaveLength(3);
    expect(r!.variants[0].text).toBe("Срочно сейчас");
  });

  it("убирает завершающий слэш между вариантами", () => {
    const r = parseVariants("Выбор? A) Первый / B) Второй");
    expect(r!.variants[0].text).toBe("Первый");
    expect(r!.variants[1].text).toBe("Второй");
  });

  it("возвращает пустой вопрос если текст начинается сразу с варианта", () => {
    const r = parseVariants("A) Вариант один B) Вариант два");
    expect(r!.question).toBe("");
    expect(r!.variants).toHaveLength(2);
  });

  it("возвращает null для текста без формата вариантов", () => {
    expect(parseVariants("Нужно уточнить детали реализации")).toBeNull();
    expect(parseVariants("1) Первое 2) Второе")).toBeNull();
  });

  it("парсит кириллические варианты А/Б/В", () => {
    const r = parseVariants("Какой подход? А) Быстрый Б) Надёжный В) Оба");
    expect(r).not.toBeNull();
    expect(r!.question).toBe("Какой подход?");
    expect(r!.variants).toHaveLength(3);
    expect(r!.variants[0]).toEqual({ id: "А", text: "Быстрый" });
    expect(r!.variants[1]).toEqual({ id: "Б", text: "Надёжный" });
    expect(r!.variants[2]).toEqual({ id: "В", text: "Оба" });
  });

  it("парсит строчные кириллические варианты и нормализует к верхнему регистру", () => {
    const r = parseVariants("Выбрать? а) вариант 1 б) вариант 2");
    expect(r).not.toBeNull();
    expect(r!.variants[0]).toEqual({ id: "А", text: "вариант 1" });
    expect(r!.variants[1]).toEqual({ id: "Б", text: "вариант 2" });
  });

  it("парсит строчные латинские варианты и нормализует к верхнему регистру", () => {
    const r = parseVariants("Делаем? a) да b) нет");
    expect(r).not.toBeNull();
    expect(r!.variants[0]).toEqual({ id: "A", text: "да" });
    expect(r!.variants[1]).toEqual({ id: "B", text: "нет" });
  });
});

describe("parseMultiQuestion", () => {
  it("одиночный вопрос без вариантов — один блок", () => {
    const r = parseMultiQuestion("Прислать логотип");
    expect(r).toHaveLength(1);
    expect(r[0].question).toBe("Прислать логотип");
    expect(r[0].variants).toBeNull();
  });

  it("одиночный вопрос с вариантами — один блок с вариантами", () => {
    const r = parseMultiQuestion("Выбрать канал? А) Telegram Б) Email");
    expect(r).toHaveLength(1);
    expect(r[0].variants).toHaveLength(2);
  });

  it("абзац-пояснение после вопроса не создаёт второй блок — один блок (образец IN-40)", () => {
    // IN-40: вопрос с вариантами + абзацы пояснения + разделитель «---»
    const text = [
      "Для запуска рекламы нужен аккаунт Google Ads. Какой вариант удобнее?",
      "А) Создам сейчас",
      "Б) Потом, не срочно",
      "В) Используем другой канал",
      "",
      "Рекомендую вариант А: реклама уже нужна, а аккаунт занимает 5 минут.",
      "",
      "---",
      "",
      "Примечание: аккаунт Google Ads привязывается к Google-аккаунту компании.",
    ].join("\n");
    const r = parseMultiQuestion(text);
    expect(r).toHaveLength(1);
    expect(r[0].variants).toHaveLength(3);
  });

  it("длинный текст без нумерации — один блок (образец LEGAL-9)", () => {
    // LEGAL-9: длинный текст с контекстом, без нумерованных вопросов
    const text = [
      "Нужно получить юридическое заключение по условиям оферты.",
      "",
      "Что нужно сделать: 1) Обратитесь к юристу, специализирующемуся на IT и e-commerce.",
      "2) Передайте им текущий проект оферты для проверки.",
      "",
      "Обратите внимание на разделы об ответственности и персональных данных.",
    ].join("\n");
    const r = parseMultiQuestion(text);
    expect(r).toHaveLength(1);
    expect(r[0].variants).toBeNull();
  });

  it("текст с нумерованными инструкциями без «?» — один блок (образец COMP-35)", () => {
    // COMP-35: инструкция с нумерацией, но без вопросительного знака
    const text = [
      "Создайте категорию «Уборка дома» в разделе Каталог.",
      "",
      "Шаги: 1. Откройте Настройки → Каталог → Категории.",
      "2. Нажмите «Добавить».",
      "3. Введите название «Уборка дома» и сохраните.",
    ].join("\n");
    const r = parseMultiQuestion(text);
    expect(r).toHaveLength(1);
    expect(r[0].variants).toBeNull();
  });

  it("два явных нумерованных вопроса с «?» — два блока", () => {
    const text = "1. Какой цвет выбрать?\n2. Какой шрифт использовать?";
    const r = parseMultiQuestion(text);
    expect(r).toHaveLength(2);
    expect(r[0].variants).toBeNull();
    expect(r[1].variants).toBeNull();
    expect(r[0].question).toBe("Какой цвет выбрать?");
    expect(r[1].question).toBe("Какой шрифт использовать?");
  });

  it("нумерованные блоки, но не все кончаются «?» — один блок", () => {
    // Если хотя бы один нумерованный элемент без «?» — не разбиваем
    const text = "1. Войти в сервис\n2. Прислать логотип";
    const r = parseMultiQuestion(text);
    expect(r).toHaveLength(1);
  });

  it("два абзаца через пустую строку — один блок (не разбивать пояснения)", () => {
    const text = "Какой цвет? А) Синий Б) Красный\n\nКакой шрифт? А) Bold Б) Regular";
    const r = parseMultiQuestion(text);
    // Не пронумерованы — один блок
    expect(r).toHaveLength(1);
  });

  it("явные нумерованные вопросы с вариантами — два блока", () => {
    const text = "1. Какой цвет?\nА) Синий Б) Красный\n2. Какой шрифт?";
    const r = parseMultiQuestion(text);
    expect(r).toHaveLength(2);
  });
});

describe("countOwnerCards", () => {
  it("три задачи с одним вопросом и одна с другим — 2 карточки", () => {
    const tasks = [
      { blockedReason: "Какой вариант? А) Да Б) Нет" },
      { blockedReason: "Какой вариант? А) Да Б) Нет" },
      { blockedReason: "Какой вариант? А) Да Б) Нет" },
      { blockedReason: "Прислать логотип" },
    ];
    expect(countOwnerCards(tasks)).toBe(2);
  });

  it("одна задача — одна карточка", () => {
    expect(countOwnerCards([{ blockedReason: "Прислать файл" }])).toBe(1);
  });

  it("пустой список — ноль карточек", () => {
    expect(countOwnerCards([])).toBe(0);
  });

  it("null причины группируются в одну карточку", () => {
    const tasks = [{ blockedReason: null }, { blockedReason: null }];
    expect(countOwnerCards(tasks)).toBe(1);
  });

  it("пробелы не влияют на группировку", () => {
    const tasks = [{ blockedReason: "Вопрос " }, { blockedReason: "Вопрос" }, { blockedReason: " Вопрос" }];
    expect(countOwnerCards(tasks)).toBe(1);
  });

  it("разные вопросы — разные карточки", () => {
    const tasks = [
      { blockedReason: "Войти в Google" },
      { blockedReason: "Прислать логотип" },
      { blockedReason: "Утвердить цены" },
    ];
    expect(countOwnerCards(tasks)).toBe(3);
  });

  it("бейдж совпадает с числом групп: 2 карточки, сумма групп 2", () => {
    // Имитирует реальный сценарий: DEV-49/50/51 — один вопрос, ещё одна задача — другой
    const tasks = [
      { blockedReason: "Выбрать канал входа? А) Telegram Б) Email" },
      { blockedReason: "Выбрать канал входа? А) Telegram Б) Email" },
      { blockedReason: "Выбрать канал входа? А) Telegram Б) Email" },
      { blockedReason: "Прислать логотип" },
    ];
    const cardCount = countOwnerCards(tasks);
    expect(cardCount).toBe(2); // бейдж = 2; заголовок YouQuestionsSection = 2; сумма групп = 2
  });
});

describe("classifyGroup", () => {
  it("вопрос с вариантами → variant (образец IN-40)", () => {
    const text = "Какой вариант удобнее? А) Создам сейчас Б) Потом В) Другой канал";
    expect(classifyGroup(text, true)).toBe("variant");
  });

  it("утвердить макет → approve, даже если есть слово «загрузить» (образец ADMIN-10)", () => {
    const text = "Утвердите макет главной страницы. Ссылка: https://figma.com/…";
    expect(classifyGroup(text, false)).toBe("approve");
  });

  it("загрузить ссылку на макет → approve (макет важнее загрузить)", () => {
    const text = "Загрузите ссылку на готовый макет для утверждения дизайна.";
    expect(classifyGroup(text, false)).toBe("approve");
  });

  it("создать категорию в админке → do (образец COMP-35)", () => {
    const text = "Создайте категорию «Уборка дома» в разделе Каталог. Откройте Настройки → Каталог → добавьте категорию.";
    expect(classifyGroup(text, false)).toBe("do");
  });

  it("добавить запись → do", () => {
    const text = "Добавьте первую услугу в каталог: зайдите в раздел «Услуги» и нажмите «Создать».";
    expect(classifyGroup(text, false)).toBe("do");
  });

  it("получить заключение юриста → other (образец LEGAL-9)", () => {
    // Текст без ценовых слов, без создания, без вариантов
    const text = "Нужно получить юридическое заключение по условиям оферты. Обратитесь к юристу по IT и e-commerce.";
    expect(classifyGroup(text, false)).toBe("other");
  });

  it("цена → price", () => {
    expect(classifyGroup("Какая стоимость выезда в пригород?", false)).toBe("price");
  });

  it("прислать логотип → data", () => {
    expect(classifyGroup("Прислать логотип в SVG-формате.", false)).toBe("data");
  });

  it("войти в Google → auth", () => {
    expect(classifyGroup("Войдите в Google Console и создайте OAuth-приложение.", false)).toBe("auth");
  });

  it("утвердить правило → approve (утвердить — выше, чем правило)", () => {
    expect(classifyGroup("Утвердите правило расчёта комиссии.", false)).toBe("approve");
  });

  it("без известных ключевых слов → other", () => {
    expect(classifyGroup("Ознакомьтесь с предложением партнёра.", false)).toBe("other");
  });
});

describe("buildPostponeReason", () => {
  it("включает исходный вопрос после даты", () => {
    const result = buildPostponeReason("1 октября", "Выбрать вариант? А) Да Б) Нет");
    expect(result).toBe("Отложено до 1 октября. Выбрать вариант? А) Да Б) Нет");
  });

  it("возвращает только дату если вопрос пустой", () => {
    const result = buildPostponeReason("1 октября", "");
    expect(result).toBe("Отложено до 1 октября");
  });

  it("обрезает пробелы исходного вопроса", () => {
    const result = buildPostponeReason("5 ноября", "  Прислать логотип  ");
    expect(result).toBe("Отложено до 5 ноября. Прислать логотип");
  });
});
