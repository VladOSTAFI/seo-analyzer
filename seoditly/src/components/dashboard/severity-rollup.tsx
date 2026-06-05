import type { SeverityCounts } from "@/lib/api/types";
import { SEVERITIES } from "@/lib/api/types";
import { SEVERITY_FILL_CLASS, SEVERITY_LABEL } from "@/lib/severity";
import { cn } from "@/lib/utils";

/**
 * Ports the Vite reference's severity "spectrum" + legend into seoditly's
 * design system. Given `bySeverity` counts it renders a single stacked bar
 * where each segment's width is proportional to its share of the total, plus an
 * optional legend of `count · label` chips.
 *
 * Two sizes:
 *   - `compact` (default false) — a thin bar, used inline in the audits list
 *     row; no legend.
 *   - full — taller bar + legend, used on the detail page rollup.
 *
 * Pure presentation; the colour scale is the shared one in `lib/severity.ts`.
 */
export function SeverityRollup({
  bySeverity,
  total,
  compact = false,
  legend = false,
  className,
}: {
  bySeverity: SeverityCounts;
  total: number;
  compact?: boolean;
  legend?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      <div
        role="img"
        aria-label={
          total === 0
            ? "No findings"
            : `Severity distribution: ${SEVERITIES.map(
                (s) => `${bySeverity[s]} ${s}`,
              ).join(", ")}`
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
                  title={`${SEVERITY_LABEL[s]}: ${n}`}
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
              {SEVERITY_LABEL[s]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
