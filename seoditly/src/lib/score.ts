import type { ScoreBand, ScoreCategoryKey } from "@/lib/api/types";
import type { Locale } from "@/lib/i18n/config";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";

/**
 * The one place the health-score band → colour mapping lives. The score ring
 * and the category bars both import from here so the band language stays
 * consistent. Thresholds (good ≥ 80 / fair ≥ 50 / poor < 50) are owned by
 * `scoreBand` in `lib/api/types.ts` (mirrored from the backend) — this module
 * only maps an already-derived band to semantic Tailwind tokens (no hex), so it
 * tracks the dark-violet design system automatically.
 */

/** Ring stroke / text colour per band (good = primary violet, fair = amber, poor = red). */
export const SCORE_BAND_STROKE_CLASS: Record<ScoreBand, string> = {
  good: "text-primary",
  fair: "text-amber-400",
  poor: "text-destructive",
};

/** Solid fill used for category bars (matches the ring band colours). */
export const SCORE_BAND_FILL_CLASS: Record<ScoreBand, string> = {
  good: "bg-primary",
  fair: "bg-amber-400",
  poor: "bg-destructive",
};

/** Per-locale band labels (used in the ring caption + aria-label). */
const SCORE_BAND_LABEL_BY_LOCALE: Record<Locale, Record<ScoreBand, string>> = {
  en: { good: "Good", fair: "Fair", poor: "Poor" },
  uk: { good: "Добре", fair: "Задовільно", poor: "Погано" },
};

export function getScoreBandLabels(locale: Locale): Record<ScoreBand, string> {
  return SCORE_BAND_LABEL_BY_LOCALE[locale] ?? SCORE_BAND_LABEL_BY_LOCALE.en;
}

/** Per-locale labels for the five score categories (in render order). */
const SCORE_CATEGORY_LABEL_BY_LOCALE: Record<
  Locale,
  Record<ScoreCategoryKey, string>
> = {
  en: {
    indexability: "Indexability",
    content: "Content",
    performance: "Performance",
    links: "Links",
    structuredData: "Structured Data",
  },
  uk: {
    indexability: "Індексованість",
    content: "Контент",
    performance: "Швидкодія",
    links: "Посилання",
    structuredData: "Структуровані дані",
  },
};

export function getScoreCategoryLabels(
  locale: Locale = DEFAULT_LOCALE,
): Record<ScoreCategoryKey, string> {
  return (
    SCORE_CATEGORY_LABEL_BY_LOCALE[locale] ?? SCORE_CATEGORY_LABEL_BY_LOCALE.en
  );
}
