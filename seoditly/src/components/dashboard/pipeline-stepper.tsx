import { Check, X } from "lucide-react";

import type { AuditStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * Horizontal pipeline stepper, ported from `frontend/src/AuditDetails.tsx`'s
 * `Pipeline`. Maps the backend's `AuditStatus` onto four ordered stages and
 * marks each done / active / failed:
 *
 *   - `done`   → every stage complete.
 *   - active   → the stage matching the current running status (pulsing dot).
 *   - earlier  → stages before the active one are done.
 *   - `failed` → the stage named by `failedStage` is marked failed; earlier
 *                stages stay done.
 *
 * `created` (pre-crawl) leaves all stages pending. Pure presentation — the
 * polling that advances `status` lives in the client wrapper.
 */
const STAGES: { status: AuditStatus; label: string }[] = [
  { status: "crawling", label: "crawl" },
  { status: "enriching", label: "enrich" },
  { status: "analyzing", label: "analyze" },
  { status: "reporting", label: "report" },
];

type StepState = "done" | "active" | "failed" | "pending";

function stepState(
  index: number,
  status: AuditStatus,
  failedStage: string | null,
  label: string,
): StepState {
  if (status === "done") return "done";
  if (status === "failed") {
    if (failedStage === label) return "failed";
    // Stages before the failed one ran; the rest stay pending.
    const failedIdx = STAGES.findIndex((s) => s.label === failedStage);
    if (failedIdx === -1) return "pending";
    return index < failedIdx ? "done" : "pending";
  }
  if (status === "created") return "pending";

  const currentIdx = STAGES.findIndex((s) => s.status === status);
  if (currentIdx === -1) return "done"; // unknown/late status → treat as done
  if (index < currentIdx) return "done";
  if (index === currentIdx) return "active";
  return "pending";
}

export function PipelineStepper({
  status,
  failedStage,
  className,
}: {
  status: AuditStatus;
  failedStage: string | null;
  className?: string;
}) {
  return (
    <ol
      aria-label="Audit pipeline"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-3 sm:gap-x-3",
        className,
      )}
    >
      {STAGES.map((stage, i) => {
        const state = stepState(i, status, failedStage, stage.label);
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
                  "text-sm capitalize",
                  state === "active" && "font-medium text-foreground",
                  state === "done" && "text-foreground",
                  state === "failed" && "font-medium text-destructive",
                  state === "pending" && "text-muted-foreground",
                )}
              >
                {stage.label}
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
