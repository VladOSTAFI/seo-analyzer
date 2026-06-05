import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch } from "lucide-react";

import { listAudits, ApiError } from "@/lib/api/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AUDITS_HREF } from "@/lib/constants";
import { DEFAULT_LOCALE, isLocale, localeHref } from "@/lib/i18n/config";
import { getRequestLocale } from "@/lib/i18n/server";
import { getDashboard, fmt } from "@/lib/copy/dashboard";
import type { Paginated, AuditDto } from "@/lib/api/types";
import { DEFAULT_LIMIT } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { AuditsTable } from "@/components/dashboard/audits-table";
import { StartAuditForm } from "@/components/dashboard/start-audit-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const { meta } = getDashboard(locale);
  return { title: meta.auditsTitle, description: meta.auditsDescription };
}

/**
 * Audits list (Phase 5). Server Component that fetches the caller's own audits
 * via the Bearer API client (`GET /audits`, page-scoped by the backend).
 *
 * `force-dynamic` keeps this off the build-time prerender path so it compiles +
 * renders with the backend DOWN. Pagination is URL-driven via `?page=`.
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
  const locale = await getRequestLocale();
  const t = getDashboard(locale);
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
        ? t.audits.errorUnreachable
        : t.audits.errorGeneral;
  }

  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) =>
    localeHref(`${AUDITS_HREF}?page=${p}`, locale);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t.audits.heading}
          </h1>
          {isAdmin && (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {t.audits.adminBadge}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {isAdmin ? t.audits.introAdmin : t.audits.introUser}
        </p>
      </header>

      {/* Start a new audit */}
      <section
        aria-label={t.audits.startSectionLabel}
        className="rounded-2xl border border-border bg-card p-5 md:p-6"
      >
        <h2 className="mb-3 text-sm font-medium text-foreground">
          {t.audits.startNewAudit}
        </h2>
        <StartAuditForm locale={locale} strings={t.startForm} />
        <p className="mt-3 text-xs text-muted-foreground">{t.audits.startHint}</p>
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
          aria-label={t.audits.noAuditsTitle}
          className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center"
        >
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
            <FileSearch aria-hidden className="size-6 text-primary" />
          </div>
          <h2 className="mt-5 text-lg font-medium text-foreground">
            {t.audits.noAuditsTitle}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {t.audits.noAuditsBody}
          </p>
        </section>
      ) : (
        <section aria-label={t.audits.heading} className="space-y-4">
          <AuditsTable items={items} locale={locale} />

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
        </section>
      )}
    </div>
  );
}
