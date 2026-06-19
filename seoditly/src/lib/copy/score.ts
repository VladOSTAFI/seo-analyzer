import type { Locale } from "@/lib/i18n/config";
import { mergeCopy, type DeepPartial } from "@/lib/i18n/merge";

/**
 * Copy for the Phase-1 health-score + prioritized-action-plan sections on the
 * audit detail page. Kept in its own module (rather than widening the large
 * `dashboard.ts` block) so the new surface is self-contained. Same EN-source /
 * UK-override deep-merge contract as `dashboard.ts`: server pages read it via
 * `getScoreCopy(locale)` and pass the slice down to the (server) section
 * components as a `strings` prop.
 */
export const scoreEn = {
  score: {
    title: "SEO health score",
    notScoredTitle: "Not scored yet",
    notScoredBody:
      "A health score is computed once the audit finishes its report stage. Older audits run before scoring shipped will stay unscored.",
    notAssessed: "Not assessed",
    notAssessedHint:
      "No rules cover this category yet, so it can't be scored — this is not the same as a clean pass.",
    outOf: "/ 100",
    categories: "Categories",
    distinctIssues: "{count} distinct issues across {pages} pages",
    bands: {
      good: "Good",
      fair: "Fair",
      poor: "Poor",
    },
  },

  actions: {
    title: "Top 10 fixes",
    subtitle: "Prioritized by impact, effort, and how many pages are affected.",
    emptyTitle: "No prioritized fixes",
    emptyRunning: "The action plan appears once analysis completes.",
    emptyClean: "Nothing to prioritize — this site passed every check.",
    pageAffected: "{count} page",
    pagesAffected: "{count} pages",
    rankLabel: "Rank",
  },
} as const;

export type ScoreCopy = typeof scoreEn;

const scoreUk: DeepPartial<ScoreCopy> = {
  score: {
    title: "Оцінка SEO-здоров’я",
    notScoredTitle: "Ще не оцінено",
    notScoredBody:
      "Оцінка обчислюється після завершення етапу формування звіту. Аудити, запущені до впровадження оцінювання, залишаться без оцінки.",
    notAssessed: "Не оцінювалося",
    notAssessedHint:
      "Цю категорію ще не покривають правила, тож її не можна оцінити — це не те саме, що бездоганний результат.",
    outOf: "/ 100",
    categories: "Категорії",
    distinctIssues: "{count} унікальних проблем на {pages} сторінках",
    bands: {
      good: "Добре",
      fair: "Задовільно",
      poor: "Погано",
    },
  },

  actions: {
    title: "10 пріоритетних виправлень",
    subtitle:
      "Відсортовано за впливом, складністю та кількістю уражених сторінок.",
    emptyTitle: "Немає пріоритетних виправлень",
    emptyRunning: "План дій з’явиться після завершення аналізу.",
    emptyClean: "Нічого пріоритезувати — сайт пройшов усі перевірки.",
    pageAffected: "{count} сторінка",
    pagesAffected: "{count} сторінок",
    rankLabel: "Місце",
  },
};

const BY_LOCALE: Record<Locale, ScoreCopy> = {
  en: scoreEn,
  uk: mergeCopy(scoreEn, scoreUk),
};

export function getScoreCopy(locale: Locale): ScoreCopy {
  return BY_LOCALE[locale];
}
