import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-group loading fallback for the dashboard. Mirrors the overview layout
 * (header + three cards + a list region) so there's no layout shift when the
 * real content streams in.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-10">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
