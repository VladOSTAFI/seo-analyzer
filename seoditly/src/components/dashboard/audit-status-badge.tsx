import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

import type { AuditStatus } from "@/lib/api/types";
import { isTerminal } from "@/lib/api/types";
import type { Locale } from "@/lib/i18n/config";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { getDashboard } from "@/lib/copy/dashboard";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Status pill for an audit. Three visual kinds:
 *   - `done`    → green-tinted, check icon.
 *   - `failed`  → destructive-tinted, warning icon.
 *   - running   → primary-tinted with a spinning loader (any non-terminal
 *                 status: created/crawling/enriching/analyzing/reporting).
 *
 * The status text is localized via `locale` (defaults to English).
 */
const KIND_CLASS = {
  done: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  failed: "bg-destructive/15 text-destructive border-destructive/25",
  running: "bg-primary/15 text-primary border-primary/25",
} as const;

export function AuditStatusBadge({
  status,
  locale = DEFAULT_LOCALE,
  className,
}: {
  status: AuditStatus;
  locale?: Locale;
  className?: string;
}) {
  const kind =
    status === "done" ? "done" : status === "failed" ? "failed" : "running";
  const running = !isTerminal(status);
  const label = getDashboard(locale).status[status] ?? status;

  const Icon = kind === "done" ? CheckCircle2 : kind === "failed" ? AlertTriangle : Loader2;

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", KIND_CLASS[kind], className)}
    >
      <Icon aria-hidden className={cn("size-3", running && "animate-spin")} />
      {label}
    </Badge>
  );
}
