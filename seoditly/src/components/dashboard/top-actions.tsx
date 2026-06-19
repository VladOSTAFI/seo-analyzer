import type { ActionSummary } from "@/lib/api/types";
import type { Locale } from "@/lib/i18n/config";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import type { ScoreCopy } from "@/lib/copy/score";
import { fmt } from "@/lib/copy/dashboard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SeverityBadge } from "@/components/dashboard/severity-badge";

/**
 * The prioritized "Top 10 fixes" list (spec §3.7). Renders `topActions`
 * ordered by `priorityScore` desc — sorted defensively here so display order is
 * correct even if the backend hands them back in another order. Each row shows
 * its rank, the action title, a severity badge, and the prevalence ("N pages").
 *
 * Empty state is graceful: while the audit is still running we say the plan
 * appears after analysis; on a finished, clean audit we say there's nothing to
 * prioritize.
 */
export function TopActions({
  actions,
  running,
  locale = DEFAULT_LOCALE,
  strings,
}: {
  actions: ActionSummary[];
  running: boolean;
  locale?: Locale;
  strings: ScoreCopy["actions"];
}) {
  const ranked = [...actions].sort(
    (a, b) => b.priorityScore - a.priorityScore,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {strings.title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{strings.subtitle}</p>
      </CardHeader>
      <CardContent>
        {ranked.length === 0 ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {strings.emptyTitle}
            </p>
            <p className="text-sm text-muted-foreground">
              {running ? strings.emptyRunning : strings.emptyClean}
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {ranked.map((action, i) => {
              const prevalenceLabel = fmt(
                action.prevalence === 1
                  ? strings.pageAffected
                  : strings.pagesAffected,
                { count: action.prevalence },
              );
              return (
                <li
                  key={action.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground tabular-nums"
                    aria-label={`${strings.rankLabel} ${i + 1}`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {action.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {prevalenceLabel}
                  </span>
                  <SeverityBadge
                    severity={action.severity}
                    locale={locale}
                    className="shrink-0"
                  />
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
