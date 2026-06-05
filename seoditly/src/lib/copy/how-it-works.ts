import { PRODUCT_NAME } from "@/lib/constants";
import type { Locale } from "@/lib/i18n/config";
import { mergeCopy, type DeepPartial } from "@/lib/i18n/merge";

/**
 * Copy for `/how-it-works`. `howItWorksEn` is the typed English source of truth
 * (and fallback); `howItWorksUk` overrides it. `getHowItWorks(locale)` deep-
 * merges UK over EN. Components call the getter; `howItWorks` stays English.
 *
 * Expected assets in `public/media/`:
 *   - `report.png`         — screenshot of the Excel report tables.
 *   - `sample-report.xlsx` — downloadable sample of the deliverable.
 */
export const howItWorksEn = {
  meta: {
    title: "How it works",
    description:
      `See exactly how ${PRODUCT_NAME} audits your site — from crawl to a ` +
      "severity-ranked Excel report — and what your developers walk away with.",
  },

  intro: {
    badge: "How it works",
    headline: "From a single URL to a report your developers can ship against.",
    subhead:
      "An audit crawls your whole site, runs every technical check, scores your Core Web Vitals, and distils it all into one prioritized Excel spec — no dashboards to learn, no raw data to sift.",
  },

  pipeline: {
    eyebrow: "The process",
    heading: "Five stages, fully automated.",
    body: "You point us at a URL. We handle the rest and hand back the result — here is what happens in between.",
    stages: [
      {
        key: "crawl",
        title: "Crawl",
        description:
          "We fetch every page, link, image, and meta tag on your site — following internal links the way a search engine does.",
      },
      {
        key: "enrich",
        title: "Enrich",
        description:
          "We map the link graph, resolve redirects, and connect canonical relationships so every URL is understood in context, not in isolation.",
      },
      {
        key: "analyze",
        title: "Analyze",
        description:
          "Around 31 technical checks run across the crawl, flagging issues and ranking each one by severity so the highest-impact work surfaces first.",
      },
      {
        key: "performance",
        title: "Performance",
        description:
          "We pull real Core Web Vitals — LCP, CLS, and INP — for key pages through Google PageSpeed and fold them into the findings.",
      },
      {
        key: "report",
        title: "Report",
        description:
          "Everything lands in a single styled Excel spec: categorized fix tables, severity ranking, and rows your developers can action directly.",
      },
    ],
  },

  checks: {
    eyebrow: "What we check",
    heading: "~31 technical checks, grouped six ways.",
    body: "Each category maps to a section in your report. Here is the breadth of what every audit covers — without the wall of detail.",
  },

  report: {
    eyebrow: "The deliverable",
    heading: "What the report looks like.",
    body: "You do not get a login and a learning curve. You get a styled Excel spec — the same structured format your developers already work from — with every issue categorized, ranked by severity, and ready to action.",
    bullets: [
      "Categorized fix tables, grouped by issue type.",
      "Severity ranking so the highest-impact work is up top.",
      "Developer-ready rows that map to concrete, shippable changes.",
    ],
    mediaAlt:
      "Excel report screenshot — categorized fix tables ranked by severity",
    download: {
      label: "Download a sample report",
      href: "/media/sample-report.xlsx",
      note: "Sample .xlsx · the same format your audit returns",
    },
  },

  expectations: {
    eyebrow: "What to expect",
    heading: "Plain expectations, no surprises.",
    items: [
      {
        key: "turnaround",
        title: "Fast turnaround",
        description:
          "Most audits complete within hours of submitting your URL — larger sites take a little longer.",
      },
      {
        key: "format",
        title: "An Excel file",
        description:
          "The deliverable is a single .xlsx spec — no portal to log into, no proprietary viewer required.",
      },
      {
        key: "severity",
        title: "Prioritized by severity",
        description:
          "Every finding is ranked critical → info, so your team knows exactly what to fix first.",
      },
    ],
  },

  cta: {
    headline: "Ready to see what's holding your SEO back?",
    body: "Send us your URL and we'll run a free audit — you'll get the same severity-ranked report your developers can act on today.",
    primary: { label: "Get a free audit", href: "/contact" },
  },
} as const;

export type HowItWorks = typeof howItWorksEn;

const howItWorksUk: DeepPartial<HowItWorks> = {
  meta: {
    title: "Як це працює",
    description:
      `Подивіться, як саме ${PRODUCT_NAME} проводить аудит вашого сайту — від ` +
      "сканування до Excel-звіту з пріоритетами за критичністю — і що отримують ваші розробники.",
  },

  intro: {
    badge: "Як це працює",
    headline: "Від одного URL до звіту, з яким працюватимуть ваші розробники.",
    subhead:
      "Аудит сканує весь ваш сайт, виконує всі технічні перевірки, оцінює Core Web Vitals і зводить усе в єдину пріоритезовану Excel-специфікацію — без панелей, які треба вивчати, і без сирих даних, у яких треба копатися.",
  },

  pipeline: {
    eyebrow: "Процес",
    heading: "П’ять етапів, повністю автоматизовано.",
    body: "Ви вказуєте нам URL. Решту ми беремо на себе й повертаємо результат — ось що відбувається між цими кроками.",
    stages: [
      {
        key: "crawl",
        title: "Сканування",
        description:
          "Ми отримуємо кожну сторінку, посилання, зображення та meta-тег вашого сайту, переходячи внутрішніми посиланнями так, як це робить пошуковик.",
      },
      {
        key: "enrich",
        title: "Збагачення",
        description:
          "Будуємо граф посилань, розкриваємо редиректи й пов’язуємо зв’язки canonical, щоб кожен URL розглядався в контексті, а не окремо.",
      },
      {
        key: "analyze",
        title: "Аналіз",
        description:
          "Близько 31 технічної перевірки проходять по всьому скануванню, виявляючи проблеми й ранжуючи кожну за критичністю, щоб найважливіше було нагорі.",
      },
      {
        key: "performance",
        title: "Швидкодія",
        description:
          "Ми отримуємо реальні Core Web Vitals — LCP, CLS та INP — для ключових сторінок через Google PageSpeed і додаємо їх до висновків.",
      },
      {
        key: "report",
        title: "Звіт",
        description:
          "Усе зводиться в єдину охайну Excel-специфікацію: категоризовані таблиці виправлень, ранжування за критичністю й рядки, які розробники можуть одразу впроваджувати.",
      },
    ],
  },

  checks: {
    eyebrow: "Що ми перевіряємо",
    heading: "~31 технічна перевірка, згрупована за шістьма напрямами.",
    body: "Кожна категорія відповідає розділу у вашому звіті. Ось обсяг того, що охоплює кожен аудит — без стіни деталей.",
  },

  report: {
    eyebrow: "Результат",
    heading: "Який вигляд має звіт.",
    body: "Жодного логіну й кривої навчання. Ви отримуєте охайну Excel-специфікацію — той самий структурований формат, з яким уже працюють ваші розробники, — де кожну проблему категоризовано, проранжовано за критичністю й готово до виправлення.",
    bullets: [
      "Категоризовані таблиці виправлень, згруповані за типом проблеми.",
      "Ранжування за критичністю — найважливіше нагорі.",
      "Готові для розробників рядки, що відповідають конкретним змінам.",
    ],
    mediaAlt:
      "Знімок Excel-звіту — категоризовані таблиці виправлень, проранжовані за критичністю",
    download: {
      label: "Завантажити приклад звіту",
      note: "Приклад .xlsx · той самий формат, який повертає ваш аудит",
    },
  },

  expectations: {
    eyebrow: "Чого очікувати",
    heading: "Чіткі очікування, жодних сюрпризів.",
    items: [
      {
        key: "turnaround",
        title: "Швидкий результат",
        description:
          "Більшість аудитів завершуються протягом кількох годин після надсилання URL — для великих сайтів трохи довше.",
      },
      {
        key: "format",
        title: "Файл Excel",
        description:
          "Результат — єдина .xlsx-специфікація: не треба заходити в портал чи встановлювати спеціальний переглядач.",
      },
      {
        key: "severity",
        title: "Пріоритети за критичністю",
        description:
          "Кожен висновок проранжовано від критичного до інформаційного, тож команда точно знає, що виправляти першим.",
      },
    ],
  },

  cta: {
    headline: "Готові побачити, що стримує ваше SEO?",
    body: "Надішліть нам свій URL — ми проведемо безкоштовний аудит, і ви отримаєте той самий звіт із пріоритетами за критичністю, з яким ваші розробники зможуть працювати вже сьогодні.",
    primary: { label: "Безкоштовний аудит", href: "/contact" },
  },
};

const BY_LOCALE: Record<Locale, HowItWorks> = {
  en: howItWorksEn,
  uk: mergeCopy(howItWorksEn, howItWorksUk),
};

export function getHowItWorks(locale: Locale): HowItWorks {
  return BY_LOCALE[locale];
}

export const howItWorks = howItWorksEn;
