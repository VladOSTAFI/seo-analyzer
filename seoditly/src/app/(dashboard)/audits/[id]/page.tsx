import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListFilter } from "lucide-react";

import { getAudit, ApiError } from "@/lib/api/client";
import { PRODUCT_NAME, AUDITS_HREF } from "@/lib/constants";
import { stripScheme } from "@/lib/format";
import { isTerminal } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { AuditDetailLive } from "@/components/dashboard/audit-detail-live";

export const metadata: Metadata = {
  title: "Audit",
  description: `An audit on ${PRODUCT_NAME}.`,
};

/**
 * Audit detail (Phase 5). Server Component: awaits the `params` Promise (Next
 * 16), fetches the detail DTO via the Bearer client, and hands the initial
 * state to the `AuditDetailLive` client wrapper which polls while non-terminal.
 *
 * Not-found posture: the backend's `AuditOwnershipGuard` returns `404` for both
 * "missing" and "not owned" so it can't be enumerated. We mirror that — ANY
 * `404` (or any other load error, to avoid leaking existence) renders the
 * single `notFound()` state; we never distinguish the two cases.
 *
 * `force-dynamic` keeps this off the build-time prerender path (no live backend
 * call at build) so it compiles with the backend down.
 */
export const dynamic = "force-dynamic";

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let audit;
  try {
    audit = await getAudit(id);
  } catch (error) {
    // 404 → missing-or-unowned (no enumeration). Any other error also renders
    // not-found rather than leaking the id's existence or a stack trace.
    if (error instanceof ApiError && error.status === 0) {
      // Backend unreachable — surface a soft error instead of a hard 404 so the
      // user understands it's transient (and the build stays green when down).
      return (
        <div className="space-y-6">
          <Link
            href={AUDITS_HREF}
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← All audits
          </Link>
          <div
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center text-sm text-destructive"
          >
            Couldn&apos;t reach the backend. Please try again shortly.
          </div>
        </div>
      );
    }
    notFound();
  }

  const terminal = isTerminal(audit.status);

  return (
    <div className="space-y-8">
      <AuditDetailLive initial={audit} />

      {/* Link to the dedicated, filterable findings view. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
        <div>
          <h2 className="text-sm font-medium text-foreground">
            Browse findings
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {terminal
              ? "Filter the full set by severity and rule."
              : "Findings become available once the audit finishes."}
          </p>
        </div>
        <Button
          asChild
          variant="outline"
          disabled={!terminal}
          className="h-10 px-4 text-sm font-medium"
        >
          {terminal ? (
            <Link href={`${AUDITS_HREF}/${id}/findings`}>
              <ListFilter aria-hidden />
              View findings
            </Link>
          ) : (
            <span>
              <ListFilter aria-hidden />
              View findings
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
