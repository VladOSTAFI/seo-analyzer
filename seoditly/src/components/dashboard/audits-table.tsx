import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { AuditDto } from "@/lib/api/types";
import { AUDITS_HREF } from "@/lib/constants";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { getDashboard, fmt } from "@/lib/copy/dashboard";
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
 * Server-rendered audits list table. Each row links to the (locale-correct)
 * audit detail page. Column headers + the failed-stage hint are localized via
 * `locale`; the backend already scopes rows to the caller.
 */
export function AuditsTable({
  items,
  locale,
}: {
  items: AuditDto[];
  locale: Locale;
}) {
  const t = getDashboard(locale).table;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t.url}</TableHead>
            <TableHead>{t.status}</TableHead>
            <TableHead className="hidden md:table-cell">{t.created}</TableHead>
            <TableHead className="w-px text-right sr-only">{t.view}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((audit) => {
            const href = localeHref(`${AUDITS_HREF}/${audit.id}`, locale);
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
                  <AuditStatusBadge status={audit.status} locale={locale} />
                  {audit.status === "failed" && audit.failedStage && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t.failedAt} {audit.failedStage}
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">
                  {formatDateTime(audit.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={href}
                    aria-label={fmt(t.viewAuditFor, { url: audit.startUrl })}
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
