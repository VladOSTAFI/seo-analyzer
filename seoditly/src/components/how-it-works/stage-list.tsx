import {
  FileSpreadsheet,
  Gauge,
  ScanSearch,
  SearchCheck,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

import { howItWorks } from "@/lib/copy/how-it-works";
import { Section } from "@/components/primitives/section";

const { pipeline } = howItWorks;

/** Maps each stage `key` to its icon — keeps icons out of the copy file. */
const STAGE_ICONS: Record<string, LucideIcon> = {
  crawl: ScanSearch,
  enrich: Waypoints,
  analyze: SearchCheck,
  performance: Gauge,
  report: FileSpreadsheet,
};

/**
 * The five pipeline stages as end-user-facing blocks (Crawl → Enrich → Analyze
 * → Performance → Report). A vertical, numbered list with a connecting rail so
 * the order reads as a process — each row is an icon, title, and explanation.
 */
export function StageList() {
  return (
    <Section eyebrow={pipeline.eyebrow} heading={pipeline.heading}>
      <p className="-mt-6 mb-12 max-w-2xl text-lg text-muted-foreground">
        {pipeline.body}
      </p>

      <ol className="relative space-y-px">
        {pipeline.stages.map((stage, index) => {
          const Icon = STAGE_ICONS[stage.key] ?? ScanSearch;
          const isLast = index === pipeline.stages.length - 1;
          return (
            <li key={stage.key} className="relative flex gap-5 sm:gap-6">
              {/* Icon + connecting rail down to the next stage. */}
              <div className="flex flex-col items-center">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Icon className="size-5" aria-hidden />
                </span>
                {!isLast && (
                  <span
                    aria-hidden
                    className="mt-1 w-px flex-1 bg-gradient-to-b from-primary/30 to-border"
                  />
                )}
              </div>

              <div className={isLast ? "pb-0" : "pb-10"}>
                <div className="flex items-baseline gap-3">
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-lg font-medium text-foreground">
                    {stage.title}
                  </h3>
                </div>
                <p className="mt-2 max-w-xl text-muted-foreground">
                  {stage.description}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
