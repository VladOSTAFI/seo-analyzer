import {
  BarChart3,
  Clock,
  FileSpreadsheet,
  type LucideIcon,
} from "lucide-react";

import { howItWorks } from "@/lib/copy/how-it-works";
import { Section } from "@/components/primitives/section";

const { expectations } = howItWorks;

/** Maps each expectation `key` to its icon — keeps icons out of the copy file. */
const EXPECTATION_ICONS: Record<string, LucideIcon> = {
  turnaround: Clock,
  format: FileSpreadsheet,
  severity: BarChart3,
};

/**
 * A short expectations strip: turnaround, that the output is an Excel file, and
 * that findings are prioritized by severity. Three compact cells in a row that
 * stack on mobile.
 */
export function Expectations() {
  return (
    <Section eyebrow={expectations.eyebrow} heading={expectations.heading}>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {expectations.items.map((item) => {
          const Icon = EXPECTATION_ICONS[item.key] ?? Clock;
          return (
            <div
              key={item.key}
              className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                <Icon className="size-4.5" aria-hidden />
              </span>
              <dt className="mt-4 text-base font-medium text-foreground">
                {item.title}
              </dt>
              <dd className="mt-1.5 text-sm text-muted-foreground">
                {item.description}
              </dd>
            </div>
          );
        })}
      </dl>
    </Section>
  );
}
