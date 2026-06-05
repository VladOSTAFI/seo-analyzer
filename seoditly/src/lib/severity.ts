import type { Severity } from "@/lib/api/types";
import type { Locale } from "@/lib/i18n/config";

/**
 * The one place severity → colour is defined for the dashboard. Both the
 * `SeverityBadge` and the rollup "spectrum" import from here so the scale stays
 * consistent across the list, detail, and findings views.
 *
 * The scale runs violet→warm: `info`/`low` sit near the product's violet
 * primary, escalating through amber to red at `critical`. All values are
 * semantic Tailwind utilities (no hardcoded hex) using `/N` opacity on the
 * theme tokens, so they track the dark-violet design system automatically.
 */

/** Badge fill/text/border classes per severity (tinted, low-chroma chips). */
export const SEVERITY_BADGE_CLASS: Record<Severity, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/25",
  high: "bg-orange-500/15 text-orange-300 border-orange-500/25",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  low: "bg-primary/15 text-primary border-primary/25",
  info: "bg-muted text-muted-foreground border-border",
};

/** Solid fill used for the rollup spectrum segments + legend swatches. */
export const SEVERITY_FILL_CLASS: Record<Severity, string> = {
  critical: "bg-destructive",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-primary",
  info: "bg-muted-foreground/60",
};

/** Per-locale human-friendly severity labels. English is the fallback. */
const SEVERITY_LABEL_BY_LOCALE: Record<Locale, Record<Severity, string>> = {
  en: {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
    info: "Info",
  },
  uk: {
    critical: "Критична",
    high: "Висока",
    medium: "Середня",
    low: "Низька",
    info: "Інформація",
  },
};

/** English severity labels (back-compat for non-localized call sites). */
export const SEVERITY_LABEL: Record<Severity, string> =
  SEVERITY_LABEL_BY_LOCALE.en;

/** Localized severity labels for the active locale (falls back to English). */
export function getSeverityLabels(locale: Locale): Record<Severity, string> {
  return SEVERITY_LABEL_BY_LOCALE[locale] ?? SEVERITY_LABEL_BY_LOCALE.en;
}
