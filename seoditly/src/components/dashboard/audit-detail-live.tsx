"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import type { AuditDetailDto } from "@/lib/api/types";
import { isTerminal } from "@/lib/api/types";
import { auditProxyPath } from "@/lib/api/client-paths";
import { AUDITS_HREF } from "@/lib/constants";
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
 * server-rendered initial `AuditDetailDto` (fetched in the page's Server
 * Component via the Bearer client) and, while the audit is non-terminal, polls
 * `GET /audits/:id` THROUGH THE PROXY every ~3s.
 *
 * Proxy + polling boundary (how they work together):
 *   - Every poll is `fetch(auditProxyPath(id))` — a same-origin call to
 *     `/api/proxy/audits/:id`. The browser NEVER hits the backend directly; the
 *     proxy route attaches the Bearer token from the httpOnly cookie.
 *   - Because polls can outlive a 15-minute access token, the proxy's
 *     transparent 401→refresh→retry keeps long polls authenticated and rotates
 *     the cookies server-side, invisibly to this component.
 *   - On a `401` that the proxy COULDN'T recover (refresh failed → session
 *     ended), it returns 401 + cleared cookies; we stop polling and refresh the
 *     route so the dashboard layout's server gate bounces to `/login`.
 *
 * Teardown: a mounted flag + a cleared timeout id ensure no state update or
 * re-schedule fires after unmount, and the loop stops the moment status is
 * terminal (`done`/`failed`). When it reaches terminal we also `router.refresh`
 * once so the server-rendered findings section picks up the final data.
 */
export function AuditDetailLive({ initial }: { initial: AuditDetailDto }) {
  const [audit, setAudit] = useState<AuditDetailDto>(initial);
  const router = useRouter();
  // Refresh the route exactly once on the running→terminal transition.
  const refreshedOnDone = useRef(false);

  useEffect(() => {
    // Already terminal on first render → nothing to poll.
    if (isTerminal(audit.status)) return;

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      try {
        const res = await fetch(auditProxyPath(initial.id), {
          cache: "no-store",
        });

        // Session ended (proxy couldn't refresh) → stop + bounce via server gate.
        if (res.status === 401) {
          if (alive) router.refresh();
          return;
        }
        // Audit vanished (e.g. deleted) → re-render server side (→ not found).
        if (res.status === 404) {
          if (alive) router.refresh();
          return;
        }
        if (!res.ok) {
          // Transient error — try again on the next interval.
          if (alive) timer = setTimeout(() => void tick(), 3000);
          return;
        }

        const next = (await res.json()) as AuditDetailDto;
        if (!alive) return;
        setAudit(next);

        if (isTerminal(next.status)) {
          if (!refreshedOnDone.current) {
            refreshedOnDone.current = true;
            router.refresh(); // pull final findings into the server section
          }
          return; // stop the loop
        }
        timer = setTimeout(() => void tick(), 3000);
      } catch {
        // Network hiccup — retry on the next interval if still mounted.
        if (alive) timer = setTimeout(() => void tick(), 3000);
      }
    }

    timer = setTimeout(() => void tick(), 3000);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // Re-arm only when the audit id changes; status transitions are handled
    // inside the loop (which returns on terminal).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id]);

  const running = !isTerminal(audit.status);

  return (
    <div className="space-y-8">
      {/* Header bar */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Link
            href={AUDITS_HREF}
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← All audits
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
            <AuditStatusBadge status={audit.status} />
            {audit.status === "failed" && audit.failedStage && (
              <span className="font-mono text-xs text-destructive">
                failed at: {audit.failedStage}
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
        />
      </div>

      {/* Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PipelineStepper status={audit.status} failedStage={audit.failedStage} />
          {running && (
            <p className="text-sm text-muted-foreground">
              Pipeline running — this readout refreshes automatically every few
              seconds.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Rollups (only meaningful once terminal, but harmless while running) */}
      <Card>
        <CardHeader className="flex-row items-baseline justify-between gap-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Findings
          </CardTitle>
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            {audit.findingsTotal}
          </span>
        </CardHeader>
        <CardContent>
          {audit.findingsTotal === 0 ? (
            <p className="text-sm text-muted-foreground">
              {running
                ? "Findings appear once analysis completes."
                : "No findings — this site passed every check."}
            </p>
          ) : (
            <SeverityRollup
              bySeverity={audit.bySeverity}
              total={audit.findingsTotal}
              legend
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
