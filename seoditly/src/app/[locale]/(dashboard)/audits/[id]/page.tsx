import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListFilter } from "lucide-react";

import { getAudit, ApiError } from "@/lib/api/client";
import { AUDITS_HREF } from "@/lib/constants";
import { DEFAULT_LOCALE, isLocale, localeHref } from "@/lib/i18n/config";
import { getRequestLocale } from "@/lib/i18n/server";
import { getDashboard } from "@/lib/copy/dashboard";
import { isTerminal } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { AuditDetailLive } from "@/components/dashboard/audit-detail-live";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const { meta } = getDashboard(locale);
  return { title: meta.auditTitle, description: meta.auditDescription };
}

/**
 * Audit detail (Phase 5). Server Component: awaits the `params` Promise (Next
 * 16), fetches the detail DTO via the Bearer client, and hands the initial
 * state to `AuditDetailLive` which polls while non-terminal.
 *
 * Not-found posture: the backend's `AuditOwnershipGuard` returns `404` for both
 * "missing" and "not owned" so it can't be enumerated — ANY error (other than
 * unreachable) renders the single `notFound()` state.
 *
 * `force-dynamic` keeps this off the build-time prerender path.
 */
export const dynamic = "force-dynamic";

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const locale = await getRequestLocale();
  const t = getDashboard(locale);

  let audit;
  try {
    audit = await getAudit(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) {
      return (
        <div className="space-y-6">
          <Link
            href={localeHref(AUDITS_HREF, locale)}
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t.detail.allAudits}
          </Link>
          <div
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center text-sm text-destructive"
          >
            {t.detail.unreachable}
          </div>
        </div>
      );
    }
    notFound();
  }

  const terminal = isTerminal(audit.status);

  return (
    <div className="space-y-8">
      <AuditDetailLive
        initial={audit}
        locale={locale}
        strings={t.detail}
        pipelineStages={t.pipelineStages}
        statusLabels={t.status}
        reportStrings={t.report}
      />

      {/* Link to the dedicated, filterable findings view. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
        <div>
          <h2 className="text-sm font-medium text-foreground">
            {t.detail.browseFindings}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {terminal ? t.detail.browseTerminal : t.detail.browseRunning}
          </p>
        </div>
        <Button
          asChild
          variant="outline"
          disabled={!terminal}
          className="h-10 px-4 text-sm font-medium"
        >
          {terminal ? (
            <Link href={localeHref(`${AUDITS_HREF}/${id}/findings`, locale)}>
              <ListFilter aria-hidden />
              {t.detail.viewFindings}
            </Link>
          ) : (
            <span>
              <ListFilter aria-hidden />
              {t.detail.viewFindings}
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
