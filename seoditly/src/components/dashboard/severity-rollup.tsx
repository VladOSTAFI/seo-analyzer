import type { SeverityCounts } from "@/lib/api/types";
import { SEVERITIES } from "@/lib/api/types";
import { SEVERITY_FILL_CLASS, getSeverityLabels } from "@/lib/severity";
import type { Locale } from "@/lib/i18n/config";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Severity "spectrum" + legend. Given `bySeverity` counts it renders a single
 * stacked bar where each segment's width is proportional to its share of the
 * total, plus an optional legend of `count · label` chips. Labels are localized
 * via `locale` (defaults to English).
 *
 * Two sizes: `compact` (a thin bar, no legend) and full (taller bar + legend).
 * Pure presentation; the colour scale is the shared one in `lib/severity.ts`.
 */
export function SeverityRollup({
  bySeverity,
  total,
  locale = DEFAULT_LOCALE,
  compact = false,
  legend = false,
  className,
}: {
  bySeverity: SeverityCounts;
  total: number;
  locale?: Locale;
  compact?: boolean;
  legend?: boolean;
  className?: string;
}) {
  const labels = getSeverityLabels(locale);

  return (
    <div className={cn("w-full", className)}>
      <div
        role="img"
        aria-label={
          total === 0
            ? "0"
            : SEVERITIES.map((s) => `${bySeverity[s]} ${labels[s]}`).join(", ")
        }
        className={cn(
          "flex w-full overflow-hidden rounded-full bg-muted",
          compact ? "h-1.5" : "h-2.5",
        )}
      >
        {total === 0
          ? null
          : SEVERITIES.map((s) => {
              const n = bySeverity[s];
              if (n === 0) return null;
              return (
                <span
                  key={s}
                  className={SEVERITY_FILL_CLASS[s]}
                  style={{ width: `${(n / total) * 100}%` }}
                  title={`${labels[s]}: ${n}`}
                />
              );
            })}
      </div>

      {legend && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {SEVERITIES.map((s) => (
            <span
              key={s}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs",
                bySeverity[s] === 0 ? "text-muted-foreground/50" : "text-muted-foreground",
              )}
            >
              <span className={cn("size-2 rounded-full", SEVERITY_FILL_CLASS[s])} />
              <b className="font-semibold text-foreground">{bySeverity[s]}</b>
              {labels[s]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
