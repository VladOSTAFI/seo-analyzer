import Link from "next/link";
import {
  ArrowRight,
  FileSpreadsheet,
  Gauge,
  ScanSearch,
  SearchCheck,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

import { home } from "@/lib/copy/home";
import { Section } from "@/components/primitives/section";
import { Card, CardContent } from "@/components/ui/card";

const { pipeline } = home;

/** Maps each copy step `key` to its icon — keeps icons out of the copy file. */
const STEP_ICONS: Record<string, LucideIcon> = {
  crawl: ScanSearch,
  enrich: Waypoints,
  analyze: SearchCheck,
  performance: Gauge,
  report: FileSpreadsheet,
};

/**
 * The five-stage pipeline as compact cards (Crawl → Enrich → Analyze →
 * Performance → Report), each with a lucide icon. Links out to the full
 * `/how-it-works` walkthrough.
 */
export function PipelineTeaser() {
  return (
    <Section eyebrow={pipeline.eyebrow} heading={pipeline.heading}>
      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {pipeline.steps.map((step, index) => {
          const Icon = STEP_ICONS[step.key] ?? ScanSearch;
          return (
            <li key={step.key}>
              <Card className="group h-full ring-border transition-colors hover:ring-primary/40">
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                      <Icon className="size-4.5" aria-hidden />
                    </span>
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-base font-medium text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>

      <div className="mt-10">
        <Link
          href={pipeline.cta.href}
          className="group inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          {pipeline.cta.label}
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>
    </Section>
  );
}
