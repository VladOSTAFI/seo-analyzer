import { cn } from "@/lib/utils";

interface PillBadgeProps {
  children: React.ReactNode;
  /** Render a pulsing violet dot before the label. */
  dot?: boolean;
  className?: string;
}

/** Rounded-full label, optionally led by a pulsing violet dot. */
export function PillBadge({ children, dot = false, className }: PillBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-sm font-medium text-foreground/90",
        className,
      )}
    >
      {dot && (
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
      )}
      {children}
    </span>
  );
}
