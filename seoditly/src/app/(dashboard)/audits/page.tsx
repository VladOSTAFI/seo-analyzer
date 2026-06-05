import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch } from "lucide-react";

import { listAudits, ApiError } from "@/lib/api/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { PRODUCT_NAME, AUDITS_HREF } from "@/lib/constants";
import type { Paginated, AuditDto } from "@/lib/api/types";
import { DEFAULT_LIMIT } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { AuditsTable } from "@/components/dashboard/audits-table";
import { StartAuditForm } from "@/components/dashboard/start-audit-form";

export const metadata: Metadata = {
  title: "Audits",
  description: `Your ${PRODUCT_NAME} audits.`,
};

/**
 * Audits list (Phase 5). Server Component that fetches the caller's own audits
 * via the Bearer API client (`GET /audits`, page-scoped by the backend).
 *
 * `force-dynamic` keeps this route off the build-time prerender path so it
 * compiles + renders with the backend DOWN — the fetch happens per-request, and
 * an unreachable backend degrades to an inline error state rather than failing
 * the build (no live calls at build time).
 *
 * Pagination is URL-driven via `?page=` (1-based) so it's shareable and works
 * without client JS; the page size is the backend default.
 */
export const dynamic = "force-dynamic";

const PAGE_SIZE = DEFAULT_LIMIT;

function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export default async function AuditsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ page: pageParam }, user] = await Promise.all([
    searchParams,
    getCurrentUser(),
  ]);
  const page = parsePage(pageParam);
  const offset = (page - 1) * PAGE_SIZE;
  const isAdmin = user?.role === "admin";

  let result: Paginated<AuditDto> | null = null;
  let error: string | null = null;
  try {
    result = await listAudits(PAGE_SIZE, offset);
  } catch (e) {
    error =
      e instanceof ApiError && e.status === 0
        ? "Couldn't reach the backend. Your audits will appear here once it's available."
        : "Couldn't load your audits right now. Please try again shortly.";
  }

  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Audits
          </h1>
          {isAdmin && (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              All audits (admin)
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "As an admin you can see every audit across all users."
            : "Every audit you've started, newest first."}
        </p>
      </header>

      {/* Start a new audit */}
      <section
        aria-label="Start an audit"
        className="rounded-2xl border border-border bg-card p-5 md:p-6"
      >
        <h2 className="mb-3 text-sm font-medium text-foreground">
          Start a new audit
        </h2>
        <StartAuditForm />
        <p className="mt-3 text-xs text-muted-foreground">
          Enter a public website URL (http or https). We&apos;ll crawl it, run
          the checks, and build a developer-ready report.
        </p>
      </section>

      {/* List / empty / error */}
      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center text-sm text-destructive"
        >
          {error}
        </div>
      ) : items.length === 0 ? (
        <section
          aria-label="No audits"
          className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center"
        >
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
            <FileSearch aria-hidden className="size-6 text-primary" />
          </div>
          <h2 className="mt-5 text-lg font-medium text-foreground">
            No audits yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Start your first audit above. Its status, severity rollups, and
            report will show up here.
          </p>
        </section>
      ) : (
        <section aria-label="Your audits" className="space-y-4">
          <AuditsTable items={items} />

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
                    <Link href={`${AUDITS_HREF}?page=${page - 1}`}>Previous</Link>
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
                    <Link href={`${AUDITS_HREF}?page=${page + 1}`}>Next</Link>
                  ) : (
                    <span>Next</span>
                  )}
                </Button>
              </div>
            </nav>
          )}
        </section>
      )}
    </div>
  );
}
