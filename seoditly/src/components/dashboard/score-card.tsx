import type { CategoryScore, ScoreResult } from "@/lib/api/types";
import { scoreBand, SCORE_CATEGORY_KEYS } from "@/lib/api/types";
import { SCORE_BAND_FILL_CLASS, getScoreCategoryLabels } from "@/lib/score";
import type { Locale } from "@/lib/i18n/config";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import type { ScoreCopy } from "@/lib/copy/score";
import { fmt } from "@/lib/copy/dashboard";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScoreRing } from "@/components/dashboard/score-ring";

/**
 * Health-score panel: the overall gauge ring plus the five category bars
 * (Indexability, Content, Performance, Links, Structured Data). A category with
 * `assessed:false` / `score:null` renders an explicit "Not assessed" row —
 * NEVER 0 or 100 — mirroring the coverage manifest's framing (spec §3.7).
 *
 * When `score === null` (older audits / not yet scored) the page renders the
 * `NotScored` placeholder below instead of this card.
 */
export function ScoreCard({
  score,
  locale = DEFAULT_LOCALE,
  strings,
}: {
  score: ScoreResult;
  locale?: Locale;
  strings: ScoreCopy["score"];
}) {
  const categoryLabels = getScoreCategoryLabels(locale);

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between gap-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {strings.title}
        </CardTitle>
        <span className="text-xs text-muted-foreground">
          {fmt(strings.distinctIssues, {
            count: score.inputs.distinctIssues,
            pages: score.inputs.pagesCrawled,
          })}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-8 sm:flex-row sm:items-center">
        <div className="flex justify-center sm:justify-start">
          <ScoreRing overall={score.overall} locale={locale} />
        </div>

        <ul className="flex-1 space-y-3" aria-label={strings.categories}>
          {SCORE_CATEGORY_KEYS.map((key) => (
            <CategoryBar
              key={key}
              label={categoryLabels[key]}
              category={score.categories[key]}
              notAssessedLabel={strings.notAssessed}
              notAssessedHint={strings.notAssessedHint}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * One category row: a label, a numeric score (or "Not assessed"), and a
 * proportional fill bar coloured by the category's own band. An unassessed
 * category shows a flat muted track with the explicit label — its bar never
 * fills, so "no rules" can't be misread as a perfect 100.
 */
function CategoryBar({
  label,
  category,
  notAssessedLabel,
  notAssessedHint,
}: {
  label: string;
  category: CategoryScore;
  notAssessedLabel: string;
  notAssessedHint: string;
}) {
  const assessed = category.assessed && category.score !== null;
  const value = category.score ?? 0;
  const band = assessed ? scoreBand(value) : null;

  return (
    <li className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-foreground">{label}</span>
        {assessed ? (
          <span className="font-medium text-foreground tabular-nums">
            {value}
          </span>
        ) : (
          <span
            className="text-xs font-medium text-muted-foreground"
            title={notAssessedHint}
          >
            {notAssessedLabel}
          </span>
        )}
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={
          assessed ? `${label}: ${value} / 100` : `${label}: ${notAssessedLabel}`
        }
      >
        {assessed && band && (
          <span
            className={cn("block h-full rounded-full", SCORE_BAND_FILL_CLASS[band])}
            style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
          />
        )}
      </div>
    </li>
  );
}

/**
 * Placeholder shown when `audit.score === null` (older audits, or an audit that
 * hasn't reached the report stage yet). Same Card chrome so it slots cleanly
 * into the detail page without an empty gap.
 */
export function ScoreNotScored({
  strings,
}: {
  strings: ScoreCopy["score"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {strings.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {strings.notScoredTitle}
        </p>
        <p className="text-sm text-muted-foreground">{strings.notScoredBody}</p>
      </CardContent>
    </Card>
  );
}
