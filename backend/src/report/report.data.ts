import { sql } from 'drizzle-orm';
import type { Database } from '../db/db.types';
import { InvalidArgumentError } from '../common/errors';
import type { Audit } from '../db/schema';
import type { Severity } from '../analyze/rule.types';
import type { FindingRow } from './report.types';

/**
 * Phase 5 data loader. Reads ONLY from `audits` + `findings` (the report layer
 * never recomputes — analysis already happened in Phase 3) and returns the
 * audit row plus every finding for it, in a fully deterministic order so the
 * emitted workbook is byte-stable across runs.
 *
 * Ordering: severity rank (critical → high → medium → low → info), then
 * `ruleId`, then `url` (NULLs last). This is the order the engine and section
 * builders see; within a sheet the builder may re-order, but the global order
 * keeps the catch-all/Summary deterministic.
 *
 * This function is pure-ish: it performs reads only and writes no status. The
 * SERVICE owns `AuditRepository.assertExists` + status transitions; the loader
 * fetches the audit defensively and throws a clear error if it is missing so a
 * direct caller (or test) never silently gets an empty report.
 */
export async function loadReportData(
  db: Database,
  auditId: string,
): Promise<{ audit: Audit; findings: FindingRow[] }> {
  const auditResult = await db.execute(sql`
    select id, start_url, status, failed_stage, report_path, created_at, updated_at
    from audits
    where id = ${auditId}
    limit 1
  `);
  const auditRow = auditResult.rows[0];
  if (!auditRow) {
    throw new InvalidArgumentError(
      `No audit found with id "${auditId}". Create one first with ` +
        `\`audit:create <url>\`, then run the pipeline through analyze.`,
    );
  }

  const audit: Audit = {
    id: auditRow.id as string,
    startUrl: auditRow.start_url as string,
    status: auditRow.status as Audit['status'],
    failedStage: (auditRow.failed_stage as string | null) ?? null,
    reportPath: (auditRow.report_path as string | null) ?? null,
    createdAt: auditRow.created_at as Date,
    updatedAt: auditRow.updated_at as Date,
  };

  const findingsResult = await db.execute(sql`
    select rule_id, severity, url, detail
    from findings
    where audit_id = ${auditId}
    order by
      case severity
        when 'critical' then 0
        when 'high' then 1
        when 'medium' then 2
        when 'low' then 3
        when 'info' then 4
        else 5
      end,
      rule_id,
      url asc nulls last
  `);

  const findings: FindingRow[] = findingsResult.rows.map((row) => ({
    ruleId: row.rule_id as string,
    severity: row.severity as Severity,
    url: (row.url as string | null) ?? null,
    detail: (row.detail as Record<string, unknown> | null) ?? {},
  }));

  return { audit, findings };
}
