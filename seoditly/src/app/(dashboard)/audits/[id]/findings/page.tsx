import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAudit, listFindings, ApiError } from "@/lib/api/client";
import { PRODUCT_NAME, AUDITS_HREF } from "@/lib/constants";
import { stripScheme } from "@/lib/format";
import { SEVERITIES, DEFAULT_LIMIT } from "@/lib/api/types";
import type { Severity, Paginated, FindingDto } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { FindingsFilters } from "@/components/dashboard/findings-filters";
import { FindingsGroups } from "@/components/dashboard/findings-groups";

export const metadata: Metadata = {
  title: "Findings",
  description: `Audit findings on ${PRODUCT_NAME}.`,
};

/**
 * Findings view (Phase 5). Server Component that awaits `params` + `searchParams`
 * (both Promises in Next 16), then fetches `GET /audits/:id/findings` through
 * the Bearer client with the `severity` + `ruleId` filters and pagination read
 * from the URL.
 *
 * Filters live in the URL (set by `FindingsFilters`) so the view is shareable
 * and re-fetches server-side on change. A `404` on the parent audit renders the
 * shared not-found state (missing-or-unowned, no enumeration).
 *
 * `force-dynamic` keeps this off the build-time prerender path.
 */
export const dynamic = "force-dynamic";

const PAGE_SIZE = DEFAULT_LIMIT;

function isSeverity(value: string | undefined): value is Severity {
  return !!value && (SEVERITIES as string[]).includes(value);
}

function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export default async function FindingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ severity?: string; ruleId?: string; page?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const severity = isSeverity(sp.severity) ? sp.severity : undefined;
  const ruleId = sp.ruleId?.trim() || undefined;
  const page = parsePage(sp.page);
  const offset = (page - 1) * PAGE_SIZE;

  // Confirm ownership/existence + get the audit URL for the header. A 404 here
  // means missing-or-unowned → shared not-found state.
  let auditUrl: string;
  try {
    const audit = await getAudit(id);
    auditUrl = audit.startUrl;
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) {
      return (
        <div className="space-y-6">
          <Link
            href={`${AUDITS_HREF}/${id}`}
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← Back to audit
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

  let result: Paginated<FindingDto> | null = null;
  let error: string | null = null;
  try {
    result = await listFindings(id, {
      severity,
      ruleId,
      limit: PAGE_SIZE,
      offset,
    });
  } catch {
    error = "Couldn't load findings right now. Please try again shortly.";
  }

  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Build a query string that preserves the active filters across pages.
  function pageHref(p: number): string {
    const params = new URLSearchParams();
    if (severity) params.set("severity", severity);
    if (ruleId) params.set("ruleId", ruleId);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs
      ? `${AUDITS_HREF}/${id}/findings?${qs}`
      : `${AUDITS_HREF}/${id}/findings`;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={`${AUDITS_HREF}/${id}`}
          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Back to audit
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          Findings
        </h1>
        <p className="truncate font-mono text-sm text-muted-foreground" title={auditUrl}>
          {stripScheme(auditUrl)}
        </p>
      </header>

      <FindingsFilters severity={severity} ruleId={ruleId} />

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center text-sm text-destructive"
        >
          {error}
        </div>
      ) : (
        <>
          <FindingsGroups items={items} total={total} />

          {totalPages > 1 && (
            <nav
              aria-label="Pagination"
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">
                Page {page} of {totalPages} · {total} total
              </span>
              <div className="flex gap-2">
                <Button
                  asChild={page > 1}
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  className="h-9"
                >
                  {page > 1 ? (
                    <Link href={pageHref(page - 1)}>Previous</Link>
                  ) : (
                    <span>Previous</span>
                  )}
                </Button>
                <Button
                  asChild={page < totalPages}
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  className="h-9"
                >
                  {page < totalPages ? (
                    <Link href={pageHref(page + 1)}>Next</Link>
                  ) : (
                    <span>Next</span>
                  )}
                </Button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
