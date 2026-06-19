import { scoreBand } from "@/lib/api/types";
import { SCORE_BAND_STROKE_CLASS, getScoreBandLabels } from "@/lib/score";
import type { Locale } from "@/lib/i18n/config";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/**
 * The overall-health gauge: a 0–100 SVG progress ring whose stroke colour comes
 * from the score band (good ≥ 80 / fair ≥ 50 / poor < 50, via `scoreBand`). The
 * track sits on `bg-muted` (the `text-muted` track stroke), the arc uses the
 * band colour token, and the centre shows the number + localized band label.
 *
 * Pure presentation; SVG only (no chart dependency). The arc length is set via
 * `stroke-dasharray`, so the fill is exactly `overall / 100` of the circle.
 */
export function ScoreRing({
  overall,
  locale = DEFAULT_LOCALE,
  className,
}: {
  overall: number;
  locale?: Locale;
  className?: string;
}) {
  const band = scoreBand(overall);
  const bandLabel = getScoreBandLabels(locale)[band];

  // Geometry: a 120×120 viewBox ring, stroke 10, leaving a 55px radius.
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, overall));
  const filled = (clamped / 100) * circumference;

  return (
    <div
      className={cn("relative inline-flex shrink-0", className)}
      role="img"
      aria-label={`${clamped} out of 100 — ${bandLabel}`}
    >
      <svg
        viewBox="0 0 120 120"
        className="size-32 -rotate-90"
        aria-hidden
      >
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="10"
          className="stroke-muted"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          className={cn("transition-all", SCORE_BAND_STROKE_CLASS[band])}
          stroke="currentColor"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
          {clamped}
        </span>
        <span
          className={cn(
            "text-xs font-medium",
            SCORE_BAND_STROKE_CLASS[band],
          )}
        >
          {bandLabel}
        </span>
      </span>
    </div>
  );
}
