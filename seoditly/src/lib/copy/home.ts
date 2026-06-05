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
    title: "Automated technical SEO audits",
    description:
      `${PRODUCT_NAME} crawls your site, runs ~31 technical checks, and hands ` +
      "your developers a severity-ranked Excel report they can action.",
  },

  hero: {
    badge: "Early access · launching soon",
    headline:
      "Technical SEO audits, automated into a developer-ready report.",
    subhead:
      "Point us at your site. We crawl every page, run ~31 technical checks, and return a single severity-ranked spec your developers can ship against.",
    primaryCta: { label: "Get a free audit", href: "/contact" },
    secondaryCta: { label: "How it works", href: "/how-it-works" },
  },

  stats: {
    eyebrow: "Proof",
    items: [
      {
        value: "48 → 805",
        label: "Pages in, findings out",
        sub: "From a single covecta.io crawl.",
      },
      {
        value: "~31",
        label: "Automated checks",
        sub: "Metadata, canonicals, links, images, performance, i18n.",
      },
      {
        value: "1",
        label: "Excel report",
        sub: "Severity-ranked and developer-ready.",
      },
    ],
  },

  platform: {
    eyebrow: "The platform",
    heading: "Every issue, mapped and ranked in one place.",
    mediaAlt:
      "Product dashboard — crawl coverage, findings by severity, and report status",
  },

  report: {
    eyebrow: "The deliverable",
    heading: "The report is the product.",
    body: "You do not get a wall of raw data. You get a styled Excel spec — the same structured format your developers already work from — with every issue categorized, ranked, and ready to action.",
    bullets: [
      "Categorized fix tables, grouped by issue type.",
      "Severity ranking so the highest-impact work surfaces first.",
      "Developer-ready: each row maps to a concrete, shippable change.",
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
          "We fetch every page, link, image, and meta tag on your site.",
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
        description: "A styled Excel spec your developers can action.",
      },
    ],
  },

  ctaBand: {
    headline: "Get a free audit of your site.",
    body: "See exactly what is holding your technical SEO back — and hand your team a report they can act on.",
    cta: { label: "Get a free audit", href: "/contact" },
  },
} as const;

export type Home = typeof homeEn;

const homeUk: DeepPartial<Home> = {
  meta: {
    title: "Автоматизований технічний SEO-аудит",
    description:
      `${PRODUCT_NAME} сканує ваш сайт, виконує ~31 технічну перевірку й ` +
      "передає розробникам Excel-звіт із пріоритетами за критичністю, готовий до роботи.",
  },

  hero: {
    badge: "Ранній доступ · скоро запуск",
    headline:
      "Технічний SEO-аудит, автоматично зведений у звіт для розробників.",
    subhead:
      "Вкажіть нам свій сайт. Ми проскануємо кожну сторінку, виконаємо ~31 технічну перевірку й повернемо єдину специфікацію із пріоритетами за критичністю, з яким зможуть працювати ваші розробники.",
    primaryCta: { label: "Безкоштовний аудит", href: "/contact" },
    secondaryCta: { label: "Як це працює", href: "/how-it-works" },
  },

  stats: {
    eyebrow: "Факти",
    items: [
      {
        value: "48 → 805",
        label: "Сторінки на вході — висновки на виході",
        sub: "З одного сканування covecta.io.",
      },
      {
        value: "~31",
        label: "Автоматичних перевірок",
        sub: "Метадані, canonical, посилання, зображення, швидкодія, i18n.",
      },
      {
        value: "1",
        label: "Excel-звіт",
        sub: "З пріоритетами за критичністю, готовий для розробників.",
      },
    ],
  },

  platform: {
    eyebrow: "Платформа",
    heading: "Усі проблеми зібрані й упорядковані в одному місці.",
    mediaAlt:
      "Кабінет продукту — охоплення сканування, висновки за критичністю та статус звіту",
  },

  report: {
    eyebrow: "Результат",
    heading: "Звіт — це і є продукт.",
    body: "Ви отримуєте не стіну сирих даних, а охайну Excel-специфікацію — той самий структурований формат, з яким уже працюють ваші розробники, — де кожну проблему категоризовано, проранжовано й готово до виправлення.",
    bullets: [
      "Категоризовані таблиці виправлень, згруповані за типом проблеми.",
      "Ранжування за критичністю — найважливіше нагорі.",
      "Готово для розробників: кожен рядок — це конкретна зміна, яку можна впровадити.",
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
          "Ми отримуємо кожну сторінку, посилання, зображення та meta-теги вашого сайту.",
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
        description: "Охайна Excel-специфікація, готова для ваших розробників.",
      },
    ],
  },

  ctaBand: {
    headline: "Отримайте безкоштовний аудит свого сайту.",
    body: "Дізнайтеся, що саме стримує ваше технічне SEO, — і передайте команді звіт, з яким вона зможе працювати.",
    cta: { label: "Безкоштовний аудит", href: "/contact" },
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
