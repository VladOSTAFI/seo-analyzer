import { cn } from "@/lib/utils";

interface StatCardProps {
  /** The headline figure, e.g. "805" or "48 → 805". */
  value: React.ReactNode;
  /** What the figure measures. */
  label: string;
  /** Optional muted supporting line. */
  sub?: string;
  className?: string;
}

/** A single proof-point: large value, label, optional muted sub. */
export function StatCard({ value, label, sub, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40",
        className,
      )}
    >
      <div className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
        {value}
      </div>
      <div className="mt-2 text-sm font-medium text-foreground/90">{label}</div>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}
