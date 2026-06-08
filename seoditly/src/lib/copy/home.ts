import { PRODUCT_NAME } from "@/lib/constants";
import type { Locale } from "@/lib/i18n/config";
import { mergeCopy, type DeepPartial } from "@/lib/i18n/merge";

/**
 * All user-facing copy for the home page. `homeEn` is the typed English source
 * of truth (and the i18n fallback); `homeUk` is a `DeepPartial` override.
 * `getHome(locale)` deep-merges UK over EN so any untranslated key falls back
 * to English. Components call `getHome(locale)`; `home` stays English.
 *
 * Expected media assets (drop into `public/media/` to swap the placeholders):
 *   - `public/media/dashboard.png` — 1280×720 product dashboard screenshot.
 *   - `public/media/report.png`    — screenshot of the Excel report tables.
 */
export const homeEn = {
  meta: {
    title: "Technical SEO audits for agencies and freelancers",
    description:
      `${PRODUCT_NAME} crawls your site, runs ~31 technical checks, and gives ` +
      "you a severity-ranked, client-ready Excel report.",
  },

  hero: {
    badge: "Early access · launching soon",
    headline:
      "Technical SEO audits, done in minutes — not afternoons.",
    subhead:
      "Built for agencies and freelancers. Point us at a client's site and we crawl every page (up to 500), run ~31 technical checks plus Core Web Vitals, and rank every issue by severity — in one client-ready Excel report you can hand straight to your client.",
    primaryCta: { label: "Run a free audit", href: "/register" },
    secondaryCta: { label: "How it works", href: "/how-it-works" },
  },

  stats: {
    eyebrow: "Proof",
    items: [
      {
        value: "500",
        label: "Pages per crawl",
        sub: "Every page on a client's site, in one pass.",
      },
      {
        value: "~31",
        label: "Automated checks",
        sub: "Metadata, canonicals, links, images, performance, i18n.",
      },
      {
        value: "1",
        label: "Excel report",
        sub: "Severity-ranked and client-ready.",
      },
    ],
  },

  problem: {
    eyebrow: "The problem",
    heading: "Still exporting a crawler into a spreadsheet at 11pm?",
    body: "Every client audit eats the same hours: crawl the site, decode raw columns, decide what actually matters, then rebuild it all into something presentable. It is slow, it is billable time lost, and one missed critical issue is the one your client notices.",
    bullets: [
      "Raw data dump: a crawler hands you columns, not answers.",
      "You interpret it: hours spent deciding what matters and why.",
      "You rebuild the report: an afternoon of formatting a client-ready spreadsheet.",
    ],
  },

  platform: {
    eyebrow: "The dashboard",
    heading: "Watch the audit run, with every issue explained.",
    mediaAlt:
      "Product dashboard — live pipeline, findings ranked by severity, and plain-language what, why, and how for each issue",
  },

  report: {
    eyebrow: "The deliverable",
    heading: "The report is the product.",
    body: "You do not get a wall of raw data. You get a formatted, multi-sheet Excel report with every issue categorized, ranked, and explained — ready to put in front of a client without an afternoon of formatting.",
    bullets: [
      "Categorized fix tables, grouped by issue type.",
      "Severity ranking so the highest-impact work surfaces first.",
      "Client-ready: every issue explained in plain language — what, why, how.",
    ],
    mediaAlt:
      "Excel report screenshot — categorized fix tables ranked by severity",
  },

  pipeline: {
    eyebrow: "How it works",
    heading: "Five stages, fully automated.",
    cta: { label: "See the full process", href: "/how-it-works" },
    steps: [
      {
        key: "crawl",
        title: "Crawl",
        description:
          "We fetch every page, link, image, and meta tag on the site.",
      },
      {
        key: "enrich",
        title: "Enrich",
        description:
          "We map the link graph, redirects, and canonical relationships.",
      },
      {
        key: "analyze",
        title: "Analyze",
        description: "~31 checks flag issues and rank them by severity.",
      },
      {
        key: "performance",
        title: "Performance",
        description: "Core Web Vitals pulled via Google PageSpeed.",
      },
      {
        key: "report",
        title: "Report",
        description: "A styled, client-ready Excel report.",
      },
    ],
  },

  ctaBand: {
    headline: "Run a free audit of any client's site.",
    body: "See exactly what is holding a site's technical SEO back — and hand your client a report they will actually read. Free, no install.",
    cta: { label: "Run a free audit", href: "/register" },
  },
} as const;

export type Home = typeof homeEn;

const homeUk: DeepPartial<Home> = {
  meta: {
    title: "Технічний SEO-аудит для агенцій і фрилансерів",
    description:
      `${PRODUCT_NAME} сканує сайт, виконує ~31 технічну перевірку й видає ` +
      "вам Excel-звіт із пріоритетами за критичністю, готовий для клієнта.",
  },

  hero: {
    badge: "Ранній доступ · скоро запуск",
    headline:
      "Технічний SEO-аудит за лічені хвилини, а не за вечір.",
    subhead:
      "Створено для агенцій і фрилансерів. Вкажіть нам сайт клієнта — ми проскануємо кожну сторінку (до 500), виконаємо ~31 технічну перевірку та Core Web Vitals і впорядкуємо кожну проблему за критичністю в одному Excel-звіті, готовому для клієнта, який можна передати йому одразу.",
    primaryCta: { label: "Зробити безкоштовний аудит", href: "/register" },
    secondaryCta: { label: "Як це працює", href: "/how-it-works" },
  },

  stats: {
    eyebrow: "Факти",
    items: [
      {
        value: "500",
        label: "Сторінок за одне сканування",
        sub: "Кожна сторінка сайту клієнта за один прохід.",
      },
      {
        value: "~31",
        label: "Автоматичних перевірок",
        sub: "Метадані, canonical, посилання, зображення, швидкодія, i18n.",
      },
      {
        value: "1",
        label: "Excel-звіт",
        sub: "З пріоритетами за критичністю, готовий для клієнта.",
      },
    ],
  },

  problem: {
    eyebrow: "Проблема",
    heading: "Досі вивантажуєте кравлер у таблицю об 11-й вечора?",
    body: "Кожен аудит клієнта з'їдає ті самі години: проскануй сайт, розшифруй сирі стовпці, виріши, що насправді важливо, а потім збери все в щось презентабельне. Це повільно, це втрачені оплачувані години, і одна пропущена критична проблема — саме та, яку помітить клієнт.",
    bullets: [
      "Сирі дані: кравлер видає стовпці, а не відповіді.",
      "Ви інтерпретуєте: години на те, щоб вирішити, що важливо й чому.",
      "Ви перебудовуєте звіт: вечір на форматування таблиці, готової для клієнта.",
    ],
  },

  platform: {
    eyebrow: "Кабінет",
    heading: "Спостерігайте за аудитом, де кожну проблему пояснено.",
    mediaAlt:
      "Кабінет продукту — живий конвеєр, висновки за критичністю та просте пояснення що, чому і як для кожної проблеми",
  },

  report: {
    eyebrow: "Результат",
    heading: "Звіт — це і є продукт.",
    body: "Ви отримуєте не стіну сирих даних, а охайний багатоаркушевий Excel-звіт, де кожну проблему категоризовано, проранжовано й пояснено — готовий покласти перед клієнтом без вечора форматування.",
    bullets: [
      "Категоризовані таблиці виправлень, згруповані за типом проблеми.",
      "Ранжування за критичністю — найважливіше нагорі.",
      "Готово для клієнта: кожну проблему пояснено простою мовою — що, чому, як.",
    ],
    mediaAlt:
      "Знімок Excel-звіту — категоризовані таблиці виправлень, проранжовані за критичністю",
  },

  pipeline: {
    eyebrow: "Як це працює",
    heading: "П’ять етапів, повністю автоматизовано.",
    cta: { label: "Переглянути весь процес", href: "/how-it-works" },
    steps: [
      {
        key: "crawl",
        title: "Сканування",
        description:
          "Ми отримуємо кожну сторінку, посилання, зображення та meta-теги сайту.",
      },
      {
        key: "enrich",
        title: "Збагачення",
        description:
          "Будуємо граф посилань, відстежуємо редиректи й зв’язки canonical.",
      },
      {
        key: "analyze",
        title: "Аналіз",
        description: "~31 перевірка виявляє проблеми й ранжує їх за критичністю.",
      },
      {
        key: "performance",
        title: "Швидкодія",
        description: "Core Web Vitals отримуємо через Google PageSpeed.",
      },
      {
        key: "report",
        title: "Звіт",
        description: "Охайний Excel-звіт, готовий для клієнта.",
      },
    ],
  },

  ctaBand: {
    headline: "Зробіть безкоштовний аудит сайту будь-якого клієнта.",
    body: "Дізнайтеся, що саме стримує технічне SEO сайту, — і передайте клієнту звіт, який він справді прочитає. Безкоштовно, без установлення.",
    cta: { label: "Зробити безкоштовний аудит", href: "/register" },
  },
};

const BY_LOCALE: Record<Locale, Home> = {
  en: homeEn,
  uk: mergeCopy(homeEn, homeUk),
};

export function getHome(locale: Locale): Home {
  return BY_LOCALE[locale];
}

export const home = homeEn;
