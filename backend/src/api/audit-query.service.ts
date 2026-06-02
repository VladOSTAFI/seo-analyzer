import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.types';
import type {
  AuditDetailDto,
  AuditDto,
  FindingDto,
  FindingsQuery,
  PageParams,
  Paginated,
  Severity,
  SeverityCounts,
} from './api.types';

/**
 * Read-side query service for the REST API (Phase 7). Owns every audit/finding
 * READ the HTTP layer needs, keeping the controller thin and SQL out of it.
 *
 * Design principle (single-sourced from the plan): push aggregations into
 * Postgres. `getAudit`'s severity rollup and the list `total`s are computed with
 * set-based SQL (GROUP BY / COUNT), never by materializing rows in Node.
 *
 * Returns plain JSON-safe DTOs ({@link AuditDto} etc., with ISO date strings).
 * A missing audit is signalled by a `null`/`undefined` return so the controller
 * owns HTTP status mapping (404), not this layer.
 *
 * CONTRACT FROZEN IN WAVE 1 — Wave 2A implements the bodies; the signatures here
 * are what AuditsController (Wave 2B) is written against. Do not change shapes.
 */
@Injectable()
export class AuditQueryService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** List audits newest-first, offset-paginated, with the unpaged total. */
  async listAudits(page: PageParams): Promise<Paginated<AuditDto>> {
    // Two set-based queries: one materializes exactly the requested page
    // (LIMIT/OFFSET, newest-first), the other COUNTs the whole table. We never
    // fetch all rows to derive `total` — that's a separate COUNT(*) below.
    const pageResult = await this.db.execute(sql`
      select id, start_url, status, failed_stage, report_path, created_at, updated_at
      from audits
      order by created_at desc
      limit ${page.limit} offset ${page.offset}
    `);

    // COUNT(*) comes back as a bigint → the pg driver hands it to us as a string,
    // hence the Number(...) coercion.
    const countResult = await this.db.execute(sql`select count(*)::text as total from audits`);
    const total = Number(countResult.rows[0]?.total ?? 0);

    const items = pageResult.rows.map((row): AuditDto => this.toAuditDto(row));

    return { items, total, limit: page.limit, offset: page.offset };
  }

  /**
   * Fetch one audit plus its finding rollups (total + zero-filled bySeverity),
   * or `undefined` if no audit has that id.
   */
  async getAudit(id: string): Promise<AuditDetailDto | undefined> {
    const auditResult = await this.db.execute(sql`
      select id, start_url, status, failed_stage, report_path, created_at, updated_at
      from audits
      where id = ${id}
      limit 1
    `);

    const auditRow = auditResult.rows[0];
    if (!auditRow) return undefined;

    // Single GROUP BY over this audit's findings: Postgres returns at most one
    // row per severity that actually occurs. We then zero-fill all five enum
    // severities so every SeverityCounts key is present even when a severity has
    // no findings (the GROUP BY simply omits absent severities).
    const bySeverityResult = await this.db.execute(sql`
      select severity, count(*)::text as count
      from findings
      where audit_id = ${id}
      group by severity
    `);

    const bySeverity = this.zeroFilledSeverityCounts();
    let findingsTotal = 0;
    for (const row of bySeverityResult.rows) {
      const severity = row.severity as Severity;
      const count = Number(row.count);
      bySeverity[severity] = count;
      findingsTotal += count;
    }

    return { ...this.toAuditDto(auditRow), findingsTotal, bySeverity };
  }

  /** Whether an audit with this id exists (cheap existence check for the controller). */
  async auditExists(id: string): Promise<boolean> {
    // `select 1 ... limit 1` short-circuits in Postgres: it stops at the first
    // matching row, so existence is O(index-lookup), not a scan/count.
    const result = await this.db.execute(sql`select 1 from audits where id = ${id} limit 1`);
    return result.rows.length > 0;
  }

  /**
   * List an audit's findings, filtered by optional severity/ruleId, offset-
   * paginated, with the filtered total. Caller checks {@link auditExists} first
   * to distinguish "no audit" (404) from "audit with zero findings" (empty page).
   */
  async listFindings(auditId: string, query: FindingsQuery): Promise<Paginated<FindingDto>> {
    // The filter predicate is built once from `sql` fragments so the page query
    // and the COUNT query share IDENTICAL WHERE clauses — the `total` always
    // reflects the same filters as the returned items. Values are interpolated
    // as bound parameters (${...}), never string-concatenated, so it stays
    // injection-safe.
    const conditions = [sql`audit_id = ${auditId}`];
    if (query.severity !== undefined) conditions.push(sql`severity = ${query.severity}`);
    if (query.ruleId !== undefined) conditions.push(sql`rule_id = ${query.ruleId}`);
    const where = sql.join(conditions, sql` and `);

    // Deterministic ordering: a CASE maps the severity enum to a numeric rank
    // (critical=0 … info=4) so the page sorts by real severity precedence rather
    // than the enum's alphabetical text. Ties break on rule_id then url, with
    // `nulls last` so site-wide findings (url IS NULL) sort after URL-scoped ones.
    const severityRank = sql`
      case severity
        when 'critical' then 0
        when 'high' then 1
        when 'medium' then 2
        when 'low' then 3
        when 'info' then 4
      end
    `;

    const pageResult = await this.db.execute(sql`
      select id, rule_id, severity, url, detail, created_at
      from findings
      where ${where}
      order by ${severityRank}, rule_id, url asc nulls last
      limit ${query.limit} offset ${query.offset}
    `);

    // Same WHERE, separate COUNT(*) (bigint → string → Number) so the total is
    // computed set-based in Postgres, not by counting materialized rows.
    const countResult = await this.db.execute(sql`
      select count(*)::text as total from findings where ${where}
    `);
    const total = Number(countResult.rows[0]?.total ?? 0);

    const items = pageResult.rows.map(
      (row): FindingDto => ({
        id: row.id as string,
        ruleId: row.rule_id as string,
        severity: row.severity as Severity,
        url: (row.url as string | null) ?? null,
        // jsonb is already parsed into an object by the pg driver; null → {}.
        detail: (row.detail as Record<string, unknown> | null) ?? {},
        createdAt: new Date(row.created_at as string).toISOString(),
      }),
    );

    return { items, total, limit: query.limit, offset: query.offset };
  }

  /** Map a raw (snake_case) audits row to the JSON-safe {@link AuditDto}. */
  private toAuditDto(row: Record<string, unknown>): AuditDto {
    return {
      id: row.id as string,
      startUrl: row.start_url as string,
      status: row.status as AuditDto['status'],
      failedStage: (row.failed_stage as string | null) ?? null,
      reportPath: (row.report_path as string | null) ?? null,
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  /** A SeverityCounts with every enum severity present and zeroed. */
  private zeroFilledSeverityCounts(): SeverityCounts {
    return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  }
}
