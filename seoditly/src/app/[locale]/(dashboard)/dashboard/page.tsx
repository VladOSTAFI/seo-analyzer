import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch, Activity, FileSpreadsheet, ArrowRight } from "lucide-react";

import { getCurrentUser } from "@/lib/auth/current-user";
import { listAudits, ApiError } from "@/lib/api/client";
import { AUDITS_HREF } from "@/lib/constants";
import { DEFAULT_LOCALE, isLocale, localeHref } from "@/lib/i18n/config";
import { getRequestLocale } from "@/lib/i18n/server";
import { getDashboard } from "@/lib/copy/dashboard";
import type { AuditDto } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  return { title: meta.dashboardTitle, description: meta.dashboardDescription };
}

/**
 * Dashboard overview (Phase 5 — live). Fetches a small slice of the caller's
 * audits via the Bearer API client and shows: a start-audit form, a "recent
 * audits" preview, and roll-up counters.
 *
 * `force-dynamic` keeps this per-request so it compiles + renders with the
 * backend DOWN — an unreachable backend degrades to empty counters and a soft
 * note rather than failing the build.
 */
export const dynamic = "force-dynamic";

const RECENT_LIMIT = 5;

export default async function DashboardPage() {
  const locale = await getRequestLocale();
  const t = getDashboard(locale);
  const user = await getCurrentUser();
  const isAdmin = user?.role === "admin";

  let recent: AuditDto[] = [];
  let total = 0;
  let unreachable = false;
  try {
    const page = await listAudits(RECENT_LIMIT, 0);
    recent = page.items;
    total = page.total;
  } catch (e) {
    unreachable = e instanceof ApiError && e.status === 0;
  }

  const latestStatus = recent[0]
    ? t.status[recent[0].status] ?? recent[0].status
    : "—";

  const overview = [
    {
      icon: Activity,
      label: t.dashboard.auditsRun,
      value: unreachable ? "—" : String(total),
      sub: t.dashboard.auditsRunSub,
    },
    {
      icon: FileSearch,
      label: t.dashboard.latestStatus,
      value: latestStatus,
      sub: t.dashboard.latestStatusSub,
    },
    {
      icon: FileSpreadsheet,
      label: t.dashboard.reports,
      value: unreachable
        ? "—"
        : String(recent.filter((a) => a.reportPath !== null).length),
      sub: t.dashboard.reportsSub,
    },
  ];

  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t.dashboard.heading}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {user ? (
              <>
                {t.dashboard.signedInAs}{" "}
                <span className="text-foreground">{user.email}</span>
                {isAdmin && (
                  <span className="ml-2 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {t.dashboard.adminBadge}
                  </span>
                )}
              </>
            ) : (
              t.dashboard.welcomeBack
            )}
          </p>
        </div>

        {/* Start audit (live). */}
        <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
          <h2 className="mb-3 text-sm font-medium text-foreground">
            {t.dashboard.startNewAudit}
          </h2>
          <StartAuditForm locale={locale} strings={t.startForm} />
        </div>
      </header>

      {/* Overview cards */}
      <section aria-label={t.dashboard.overviewLabel} className="grid gap-4 sm:grid-cols-3">
        {overview.map(({ icon: Icon, label, value, sub }) => (
          <Card key={label}>
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon aria-hidden className="size-4 text-primary" />
                <CardDescription>{label}</CardDescription>
              </div>
              <CardTitle className="text-3xl font-semibold tracking-tight text-foreground">
                {value}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Recent audits preview / empty state. */}
      <section aria-label={t.dashboard.recentAudits} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">
            {isAdmin ? t.dashboard.recentAuditsAll : t.dashboard.recentAudits}
          </h2>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-9 text-sm text-muted-foreground"
          >
            <Link href={localeHref(AUDITS_HREF, locale)}>
              {t.dashboard.viewAll}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>

        {unreachable ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center text-sm text-muted-foreground">
            {t.dashboard.unreachable}
          </div>
        ) : recent.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
              <FileSearch aria-hidden className="size-6 text-primary" />
            </div>
            <h3 className="mt-5 text-base font-medium text-foreground">
              {t.dashboard.noAuditsTitle}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {t.dashboard.noAuditsBody}
            </p>
          </div>
        ) : (
          <AuditsTable items={recent} locale={locale} />
        )}
      </section>
    </div>
  );
}
