"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import type { AuditDetailDto } from "@/lib/api/types";
import { isTerminal } from "@/lib/api/types";
import { auditProxyPath } from "@/lib/api/client-paths";
import { AUDITS_HREF } from "@/lib/constants";
import { localeHref, type Locale } from "@/lib/i18n/config";
import type { Dashboard } from "@/lib/copy/dashboard";
import { stripScheme, formatDateTime } from "@/lib/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuditStatusBadge } from "@/components/dashboard/audit-status-badge";
import { PipelineStepper } from "@/components/dashboard/pipeline-stepper";
import { SeverityRollup } from "@/components/dashboard/severity-rollup";
import { ReportDownloadButton } from "@/components/dashboard/report-download-button";

/**
 * Client wrapper that owns the live state of an audit detail. It receives the
 * server-rendered initial `AuditDetailDto` and, while the audit is non-terminal,
 * polls `GET /audits/:id` THROUGH THE PROXY every ~3s. All copy is passed in
 * (localized server-side); the polling/refresh behavior is unchanged.
 */
export function AuditDetailLive({
  initial,
  locale,
  strings,
  reportStrings,
}: {
  initial: AuditDetailDto;
  locale: Locale;
  strings: Dashboard["detail"];
  pipelineStages: Dashboard["pipelineStages"];
  statusLabels: Dashboard["status"];
  reportStrings: Dashboard["report"];
}) {
  const [audit, setAudit] = useState<AuditDetailDto>(initial);
  const router = useRouter();
  const refreshedOnDone = useRef(false);

  useEffect(() => {
    if (isTerminal(audit.status)) return;

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      try {
        const res = await fetch(auditProxyPath(initial.id), {
          cache: "no-store",
        });

        if (res.status === 401) {
          if (alive) router.refresh();
          return;
        }
        if (res.status === 404) {
          if (alive) router.refresh();
          return;
        }
        if (!res.ok) {
          if (alive) timer = setTimeout(() => void tick(), 3000);
          return;
        }

        const next = (await res.json()) as AuditDetailDto;
        if (!alive) return;
        setAudit(next);

        if (isTerminal(next.status)) {
          if (!refreshedOnDone.current) {
            refreshedOnDone.current = true;
            router.refresh();
          }
          return;
        }
        timer = setTimeout(() => void tick(), 3000);
      } catch {
        if (alive) timer = setTimeout(() => void tick(), 3000);
      }
    }

    timer = setTimeout(() => void tick(), 3000);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id]);

  const running = !isTerminal(audit.status);

  return (
    <div className="space-y-8">
      {/* Header bar */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Link
            href={localeHref(AUDITS_HREF, locale)}
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {strings.allAudits}
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            <a
              href={audit.startUrl}
              target="_blank"
              rel="noreferrer"
              className="truncate hover:text-primary"
              title={audit.startUrl}
            >
              {stripScheme(audit.startUrl)}
            </a>
            <ArrowUpRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
            <AuditStatusBadge status={audit.status} locale={locale} />
            {audit.status === "failed" && audit.failedStage && (
              <span className="font-mono text-xs text-destructive">
                {strings.failedAt} {audit.failedStage}
              </span>
            )}
            <span className="font-mono text-xs">
              {formatDateTime(audit.createdAt)}
            </span>
          </div>
        </div>

        <ReportDownloadButton
          auditId={audit.id}
          reportReady={audit.reportPath !== null}
          label={reportStrings.download}
          notReadyTitle={reportStrings.notReadyTitle}
        />
      </div>

      {/* Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {strings.pipeline}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PipelineStepper
            status={audit.status}
            failedStage={audit.failedStage}
            locale={locale}
          />
          {running && (
            <p className="text-sm text-muted-foreground">
              {strings.pipelineRunning}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Rollups */}
      <Card>
        <CardHeader className="flex-row items-baseline justify-between gap-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {strings.findings}
          </CardTitle>
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            {audit.findingsTotal}
          </span>
        </CardHeader>
        <CardContent>
          {audit.findingsTotal === 0 ? (
            <p className="text-sm text-muted-foreground">
              {running ? strings.findingsAppearWhenRunning : strings.noFindings}
            </p>
          ) : (
            <SeverityRollup
              bySeverity={audit.bySeverity}
              total={audit.findingsTotal}
              locale={locale}
              legend
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
