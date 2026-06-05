import type { Locale } from "@/lib/i18n/config";

/**
 * Single source of truth for the technical-SEO checks the audit runs.
 *
 * Grouped into the six categories the pipeline reports against (Metadata,
 * Canonical/Indexing, Links, Images, Performance, i18n). Editing a check name,
 * adding one, or re-categorising happens here — the `/how-it-works` checks grid
 * renders straight from this array via `getCheckCategories(locale)`.
 *
 * i18n: English is authored in full below; a `uk` override supplies the
 * translated `category`/`blurb`/`items` per `key`. `getCheckCategories(locale)`
 * returns the locale-correct array (English fields fall through where a UK
 * value is absent). `CHECK_COUNT` is derived from the English list so the
 * "~31 checks" figure stays honest and locale-stable.
 */
export interface CheckCategory {
  /** Stable key for React lists + icon lookup. */
  key: string;
  /** Human-readable category label shown as the card title. */
  category: string;
  /** One-line description of what this family of checks covers. */
  blurb: string;
  /** Individual check names within the category. */
  items: string[];
}

export const CHECK_CATEGORIES: readonly CheckCategory[] = [
  {
    key: "metadata",
    category: "Metadata",
    blurb: "Titles, descriptions, and headings that search engines read first.",
    items: [
      "Missing or empty <title>",
      "Duplicate titles across pages",
      "Title length outside the recommended range",
      "Missing meta description",
      "Duplicate meta descriptions",
      "Meta description length outside range",
      "Missing or multiple <h1> tags",
      "Missing viewport / charset meta tags",
    ],
  },
  {
    key: "canonical",
    category: "Canonical & Indexing",
    blurb: "Signals that decide which URLs are indexed and which are ignored.",
    items: [
      "Missing canonical tag",
      "Canonical points to a non-200 URL",
      "Canonical points off-site or to a redirect",
      "noindex on a page that should be indexed",
      "URL blocked by robots.txt",
      "Missing or malformed XML sitemap entry",
      "Non-self-referencing canonical on paginated pages",
    ],
  },
  {
    key: "links",
    category: "Links",
    blurb: "The link graph, redirects, and dead ends crawlers hit.",
    items: [
      "Broken internal links (4xx / 5xx)",
      "Redirect chains and loops",
      "Links to non-canonical URLs",
      "Orphan pages with no inbound links",
      "Mixed HTTP / HTTPS links",
      "Anchors with empty or generic link text",
    ],
  },
  {
    key: "images",
    category: "Images",
    blurb: "Asset health that affects accessibility and image search.",
    items: [
      "Images missing alt text",
      "Broken image sources",
      "Oversized images without compression",
      "Missing width / height (layout shift risk)",
    ],
  },
  {
    key: "performance",
    category: "Performance",
    blurb: "Core Web Vitals and load behaviour via Google PageSpeed.",
    items: [
      "Largest Contentful Paint (LCP) over budget",
      "Cumulative Layout Shift (CLS) over budget",
      "Interaction to Next Paint (INP) over budget",
      "Render-blocking resources",
      "Uncompressed or unminified assets",
    ],
  },
  {
    key: "i18n",
    category: "Internationalization",
    blurb: "Language and region targeting for multi-locale sites.",
    items: [
      "Missing or invalid hreflang annotations",
      "hreflang without a return (reciprocal) tag",
      "Missing or incorrect lang attribute",
    ],
  },
] as const;

/** Total number of individual checks — keeps the "~31 checks" copy honest. */
export const CHECK_COUNT = CHECK_CATEGORIES.reduce(
  (total, group) => total + group.items.length,
  0,
);

/** Translated `category`/`blurb`/`items` per category `key` (UK). */
const CHECKS_UK: Record<string, { category: string; blurb: string; items: string[] }> = {
  metadata: {
    category: "Метадані",
    blurb: "Заголовки, описи й заголовки сторінок, які пошукові системи читають першими.",
    items: [
      "Відсутній або порожній <title>",
      "Дубльовані заголовки на різних сторінках",
      "Довжина <title> поза рекомендованим діапазоном",
      "Відсутній meta description",
      "Дубльовані meta description",
      "Довжина meta description поза діапазоном",
      "Відсутній або кілька тегів <h1>",
      "Відсутні meta-теги viewport / charset",
    ],
  },
  canonical: {
    category: "Canonical та індексація",
    blurb: "Сигнали, що визначають, які URL індексуються, а які — ні.",
    items: [
      "Відсутній тег canonical",
      "Canonical вказує на URL зі статусом не 200",
      "Canonical вказує на інший сайт або на редирект",
      "noindex на сторінці, яка має індексуватися",
      "URL заблоковано в robots.txt",
      "Відсутній або хибний запис у XML-карті сайту",
      "Canonical без посилання на себе на сторінках пагінації",
    ],
  },
  links: {
    category: "Посилання",
    blurb: "Граф посилань, редиректи й глухі кути, на які натрапляють краулери.",
    items: [
      "Биті внутрішні посилання (4xx / 5xx)",
      "Ланцюги та цикли редиректів",
      "Посилання на неканонічні URL",
      "Сторінки-сироти без вхідних посилань",
      "Змішані HTTP / HTTPS посилання",
      "Анкори з порожнім або загальним текстом",
    ],
  },
  images: {
    category: "Зображення",
    blurb: "Стан зображень, що впливає на доступність і пошук за картинками.",
    items: [
      "Зображення без alt-тексту",
      "Биті джерела зображень",
      "Завеликі зображення без стиснення",
      "Відсутні width / height (ризик зсуву макета)",
    ],
  },
  performance: {
    category: "Швидкодія",
    blurb: "Core Web Vitals і поведінка завантаження через Google PageSpeed.",
    items: [
      "Largest Contentful Paint (LCP) перевищує бюджет",
      "Cumulative Layout Shift (CLS) перевищує бюджет",
      "Interaction to Next Paint (INP) перевищує бюджет",
      "Ресурси, що блокують рендеринг",
      "Нестиснені або немініфіковані ресурси",
    ],
  },
  i18n: {
    category: "Інтернаціоналізація",
    blurb: "Таргетування за мовою та регіоном для багатомовних сайтів.",
    items: [
      "Відсутні або хибні анотації hreflang",
      "hreflang без зворотного (взаємного) тега",
      "Відсутній або некоректний атрибут lang",
    ],
  },
};

/** Locale-correct check categories (English fields are the fallback). */
export function getCheckCategories(locale: Locale): readonly CheckCategory[] {
  if (locale === "en") return CHECK_CATEGORIES;
  return CHECK_CATEGORIES.map((group) => {
    const t = CHECKS_UK[group.key];
    return t ? { ...group, ...t } : group;
  });
}
