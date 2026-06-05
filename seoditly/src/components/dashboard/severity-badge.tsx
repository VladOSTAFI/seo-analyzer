import type { Severity } from "@/lib/api/types";
import { SEVERITY_BADGE_CLASS, getSeverityLabels } from "@/lib/severity";
import type { Locale } from "@/lib/i18n/config";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * A severity chip on the violet→severity scale (see `lib/severity.ts`). Shared
 * by the audits list, the detail rollups, and the findings view so the colour
 * language is identical everywhere. The label is localized via `locale` (passed
 * down from the page / parent client component; defaults to English).
 */
export function SeverityBadge({
  severity,
  locale = DEFAULT_LOCALE,
  className,
}: {
  severity: Severity;
  locale?: Locale;
  className?: string;
}) {
  const labels = getSeverityLabels(locale);
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", SEVERITY_BADGE_CLASS[severity], className)}
    >
      {labels[severity]}
    </Badge>
  );
}
