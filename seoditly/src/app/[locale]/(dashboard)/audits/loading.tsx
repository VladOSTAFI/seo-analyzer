import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading fallback for the audits list. Mirrors the header + start-audit card +
 * table layout so there's no shift when the live data streams in.
 */
export default function AuditsLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-28 rounded-2xl" />
      <div className="space-y-3">
        <Skeleton className="h-12 rounded-xl" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
