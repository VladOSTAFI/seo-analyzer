import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAudit, listFindings, ApiError } from "@/lib/api/client";
import { AUDITS_HREF } from "@/lib/constants";
import { DEFAULT_LOCALE, isLocale, localeHref } from "@/lib/i18n/config";
import { getRequestLocale } from "@/lib/i18n/server";
import { getDashboard, fmt } from "@/lib/copy/dashboard";
import { stripScheme } from "@/lib/format";
import { SEVERITIES, DEFAULT_LIMIT } from "@/lib/api/types";
import type { Severity, Paginated, FindingDto } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { FindingsFilters } from "@/components/dashboard/findings-filters";
import { FindingsGroups } from "@/components/dashboard/findings-groups";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const { meta } = getDashboard(locale);
  return { title: meta.findingsTitle, description: meta.findingsDescription };
}

/**
 * Findings view (Phase 5). Server Component that awaits `params` + `searchParams`
 * (both Promises in Next 16), then fetches `GET /audits/:id/findings` through
 * the Bearer client with the `severity` + `ruleId` filters and pagination from
 * the URL. Filters live in the URL so the view is shareable.
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
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ severity?: string; ruleId?: string; page?: string }>;
}) {
  const locale = await getRequestLocale();
  const t = getDashboard(locale);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const severity = isSeverity(sp.severity) ? sp.severity : undefined;
  const ruleId = sp.ruleId?.trim() || undefined;
  const page = parsePage(sp.page);
  const offset = (page - 1) * PAGE_SIZE;

  // Confirm ownership/existence + get the audit URL for the header.
  let auditUrl: string;
  try {
    const audit = await getAudit(id);
    auditUrl = audit.startUrl;
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) {
      return (
        <div className="space-y-6">
          <Link
            href={localeHref(`${AUDITS_HREF}/${id}`, locale)}
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t.findings.backToAudit}
          </Link>
          <div
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center text-sm text-destructive"
          >
            {t.findings.unreachable}
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
    error = t.findings.errorGeneral;
  }

  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Build a query string that preserves the active filters across pages.
  function pageHref(p: number): string {
    const qsParams = new URLSearchParams();
    if (severity) qsParams.set("severity", severity);
    if (ruleId) qsParams.set("ruleId", ruleId);
    if (p > 1) qsParams.set("page", String(p));
    const qs = qsParams.toString();
    const base = `${AUDITS_HREF}/${id}/findings`;
    return localeHref(qs ? `${base}?${qs}` : base, locale);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={localeHref(`${AUDITS_HREF}/${id}`, locale)}
          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {t.findings.backToAudit}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {t.findings.heading}
        </h1>
        <p className="truncate font-mono text-sm text-muted-foreground" title={auditUrl}>
          {stripScheme(auditUrl)}
        </p>
      </header>

      <FindingsFilters
        severity={severity}
        ruleId={ruleId}
        locale={locale}
        strings={t.findings}
      />

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center text-sm text-destructive"
        >
          {error}
        </div>
      ) : (
        <>
          <FindingsGroups
            items={items}
            total={total}
            locale={locale}
            strings={t.findings}
          />

          {totalPages > 1 && (
            <nav
              aria-label={t.pagination.label}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">
                {fmt(t.pagination.pageOf, { page, totalPages, total })}
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
                    <Link href={pageHref(page - 1)}>{t.pagination.previous}</Link>
                  ) : (
                    <span>{t.pagination.previous}</span>
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
                    <Link href={pageHref(page + 1)}>{t.pagination.next}</Link>
                  ) : (
                    <span>{t.pagination.next}</span>
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
