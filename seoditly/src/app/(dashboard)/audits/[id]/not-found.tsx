import Link from "next/link";
import { SearchX } from "lucide-react";

import { AUDITS_HREF } from "@/lib/constants";
import { Button } from "@/components/ui/button";

/**
 * Single not-found state for an audit id. Triggered by `notFound()` in the
 * detail/findings pages when the backend returns `404` — which means the audit
 * is missing OR not owned by the caller. We deliberately DON'T distinguish the
 * two (no enumeration), matching the backend's `AuditOwnershipGuard` posture.
 */
export default function AuditNotFound() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
        <SearchX aria-hidden className="size-6 text-muted-foreground" />
      </div>
      <h1 className="mt-5 text-lg font-medium text-foreground">
        Audit not found
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        This audit doesn&apos;t exist, or it isn&apos;t one of yours. Check the
        link, or head back to your audits.
      </p>
      <div className="mt-6">
        <Button asChild variant="outline" className="h-10 px-4 text-sm font-medium">
          <Link href={AUDITS_HREF}>Back to audits</Link>
        </Button>
      </div>
    </div>
  );
}
