import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { AuditDto } from "@/lib/api/types";
import { AUDITS_HREF } from "@/lib/constants";
import { stripScheme, formatDateTime } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AuditStatusBadge } from "@/components/dashboard/audit-status-badge";

/**
 * Server-rendered audits list table. Each row links to the audit detail page.
 *
 * The list endpoint returns `AuditDto` (no `bySeverity` rollups — those live on
 * the detail DTO), so this table shows URL, status, and created date; the
 * per-severity spectrum appears on the detail page. The backend already scopes
 * rows to the caller, so there is no client-side owner filtering.
 */
export function AuditsTable({ items }: { items: AuditDto[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>URL</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Created</TableHead>
            <TableHead className="w-px text-right sr-only">View</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((audit) => {
            const href = `${AUDITS_HREF}/${audit.id}`;
            return (
              <TableRow key={audit.id} className="group">
                <TableCell className="max-w-[22rem] font-medium">
                  <Link
                    href={href}
                    className="block truncate text-foreground underline-offset-4 hover:text-primary hover:underline"
                    title={audit.startUrl}
                  >
                    {stripScheme(audit.startUrl)}
                  </Link>
                </TableCell>
                <TableCell>
                  <AuditStatusBadge status={audit.status} />
                  {audit.status === "failed" && audit.failedStage && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      at {audit.failedStage}
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">
                  {formatDateTime(audit.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={href}
                    aria-label={`View audit for ${audit.startUrl}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ArrowRight aria-hidden className="size-4" />
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
