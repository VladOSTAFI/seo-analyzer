import type { FindingDto } from "@/lib/api/types";
import { stripScheme } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SeverityBadge } from "@/components/dashboard/severity-badge";

/**
 * Findings table, ported from the Vite reference. Each row shows severity,
 * ruleId, the affected URL (or a "site-wide" marker), and a compact render of
 * the jsonb `detail` blob. When `total > items.length` a truncation note hints
 * the user to filter or download the full report.
 *
 * Presentation-only — filtering/pagination is driven by the parent (the
 * findings page reads `severity`/`ruleId` from search params; the detail tab
 * uses a client filter).
 */

/** Compactly render the jsonb `detail` as `key: value` pairs (first 4 keys). */
function renderDetail(detail: Record<string, unknown>) {
  const entries = Object.entries(detail ?? {});
  if (entries.length === 0) {
    return <span className="text-muted-foreground/60">—</span>;
  }
  return (
    <span className="font-mono text-xs">
      {entries.slice(0, 4).map(([k, v], i) => (
        <span key={k}>
          {i > 0 && <span className="text-muted-foreground/50"> · </span>}
          <span className="text-muted-foreground">{k}:</span>{" "}
          <span className="text-foreground">
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </span>
        </span>
      ))}
    </span>
  );
}

export function FindingsTable({
  items,
  total,
}: {
  items: FindingDto[];
  total: number;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground">
        No findings for this filter.
      </p>
    );
  }

  const truncated = total > items.length;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-28">Severity</TableHead>
              <TableHead className="w-48">Rule</TableHead>
              <TableHead className="w-56">URL</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((f) => (
              <TableRow key={f.id} className="align-top">
                <TableCell>
                  <SeverityBadge severity={f.severity} />
                </TableCell>
                <TableCell className="font-mono text-xs text-foreground">
                  {f.ruleId}
                </TableCell>
                <TableCell className="max-w-[14rem] font-mono text-xs">
                  {f.url ? (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-primary underline-offset-4 hover:underline"
                      title={f.url}
                    >
                      {stripScheme(f.url)}
                    </a>
                  ) : (
                    <span className="text-muted-foreground/60">— site-wide —</span>
                  )}
                </TableCell>
                <TableCell>{renderDetail(f.detail)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {truncated && (
        <p className="text-xs text-muted-foreground">
          Showing the first {items.length} of {total}. Filter by severity or
          rule, or download the report for the full set.
        </p>
      )}
    </div>
  );
}
