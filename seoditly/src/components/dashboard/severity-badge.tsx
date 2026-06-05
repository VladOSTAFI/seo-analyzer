import type { Severity } from "@/lib/api/types";
import { SEVERITY_BADGE_CLASS, SEVERITY_LABEL } from "@/lib/severity";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * A severity chip on the violet→severity scale (see `lib/severity.ts`). Shared
 * by the audits list, the detail rollups, and the findings table so the colour
 * language is identical everywhere. Renders as an `outline` shadcn `Badge` with
 * the per-severity tint overlaid.
 */
export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium capitalize", SEVERITY_BADGE_CLASS[severity], className)}
    >
      {SEVERITY_LABEL[severity]}
    </Badge>
  );
}
