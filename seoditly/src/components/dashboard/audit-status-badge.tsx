import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

import type { AuditStatus } from "@/lib/api/types";
import { isTerminal } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Status pill for an audit. Three visual kinds:
 *   - `done`    → green-tinted, check icon.
 *   - `failed`  → destructive-tinted, warning icon.
 *   - running   → primary-tinted with a spinning loader (any non-terminal
 *                 status: created/crawling/enriching/analyzing/reporting).
 *
 * The status string is shown verbatim (capitalised) so the live pipeline stage
 * is visible while polling.
 */
const KIND_CLASS = {
  done: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  failed: "bg-destructive/15 text-destructive border-destructive/25",
  running: "bg-primary/15 text-primary border-primary/25",
} as const;

export function AuditStatusBadge({
  status,
  className,
}: {
  status: AuditStatus;
  className?: string;
}) {
  const kind =
    status === "done" ? "done" : status === "failed" ? "failed" : "running";
  const running = !isTerminal(status);

  const Icon = kind === "done" ? CheckCircle2 : kind === "failed" ? AlertTriangle : Loader2;

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium capitalize", KIND_CLASS[kind], className)}
    >
      <Icon aria-hidden className={cn("size-3", running && "animate-spin")} />
      {status}
    </Badge>
  );
}
