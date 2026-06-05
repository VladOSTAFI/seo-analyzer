import { Check, X } from "lucide-react";

import type { AuditStatus } from "@/lib/api/types";
import type { Locale } from "@/lib/i18n/config";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { getDashboard } from "@/lib/copy/dashboard";
import { cn } from "@/lib/utils";

/**
 * Horizontal pipeline stepper. Maps the backend's `AuditStatus` onto four
 * ordered stages and marks each done / active / failed.
 *
 * The stage `key` (`crawl`/`enrich`/`analyze`/`report`) is the stable English
 * identifier the backend also uses for `failedStage`, so matching stays on the
 * key; only the DISPLAY label is localized via `locale` (defaults to English).
 *
 *   - `done`   → every stage complete.
 *   - active   → the stage matching the current running status (pulsing dot).
 *   - `failed` → the stage named by `failedStage` is marked failed; earlier
 *                stages stay done.
 */
const STAGES: { status: AuditStatus; key: "crawl" | "enrich" | "analyze" | "report" }[] = [
  { status: "crawling", key: "crawl" },
  { status: "enriching", key: "enrich" },
  { status: "analyzing", key: "analyze" },
  { status: "reporting", key: "report" },
];

type StepState = "done" | "active" | "failed" | "pending";

function stepState(
  index: number,
  status: AuditStatus,
  failedStage: string | null,
  key: string,
): StepState {
  if (status === "done") return "done";
  if (status === "failed") {
    if (failedStage === key) return "failed";
    const failedIdx = STAGES.findIndex((s) => s.key === failedStage);
    if (failedIdx === -1) return "pending";
    return index < failedIdx ? "done" : "pending";
  }
  if (status === "created") return "pending";

  const currentIdx = STAGES.findIndex((s) => s.status === status);
  if (currentIdx === -1) return "done";
  if (index < currentIdx) return "done";
  if (index === currentIdx) return "active";
  return "pending";
}

export function PipelineStepper({
  status,
  failedStage,
  locale = DEFAULT_LOCALE,
  className,
}: {
  status: AuditStatus;
  failedStage: string | null;
  locale?: Locale;
  className?: string;
}) {
  const t = getDashboard(locale);

  return (
    <ol
      aria-label={t.detail.auditPipelineLabel}
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-3 sm:gap-x-3",
        className,
      )}
    >
      {STAGES.map((stage, i) => {
        const state = stepState(i, status, failedStage, stage.key);
        const label = t.pipelineStages[stage.key];
        return (
          <li key={stage.status} className="flex items-center gap-2 sm:gap-3">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                  state === "done" &&
                    "border-primary/40 bg-primary/15 text-primary",
                  state === "active" &&
                    "animate-pulse border-primary bg-primary text-primary-foreground",
                  state === "failed" &&
                    "border-destructive/40 bg-destructive/15 text-destructive",
                  state === "pending" &&
                    "border-border bg-muted text-muted-foreground",
                )}
              >
                {state === "done" ? (
                  <Check aria-hidden className="size-3" />
                ) : state === "failed" ? (
                  <X aria-hidden className="size-3" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  "text-sm",
                  state === "active" && "font-medium text-foreground",
                  state === "done" && "text-foreground",
                  state === "failed" && "font-medium text-destructive",
                  state === "pending" && "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </span>
            {i < STAGES.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "hidden h-px w-6 sm:block",
                  state === "done" ? "bg-primary/40" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
