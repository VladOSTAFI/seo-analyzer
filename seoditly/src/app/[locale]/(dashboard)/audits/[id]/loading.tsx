import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading fallback for the audit detail page. Approximates the header +
 * pipeline + rollup cards so the live readout streams in without layout shift.
 */
export default function AuditDetailLoading() {
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-5 w-48" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}
