import { Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../auth/auth.types';
import { DB, type Database } from '../db/db.types';
import { distinctIssueCount } from '../report/report.summary';
import type {
  AuditDetailDto,
  AuditDto,
  Confidence,
  FindingDto,
  FindingsQuery,
  PageParams,
  Paginated,
  Severity,
  SeverityCounts,
} from './api.types';
import type { CoverageManifest } from '../report/report.types';

/**
 * Read-side query service for the REST API (Phase 7). Owns every audit/finding
 * READ the HTTP layer needs, keeping the controller thin and SQL out of it.
 *
 * Design principle (single-sourced from the plan): push aggregations into
 * Postgres. `getAudit`'s severity rollup and the list `total`s are computed with
 * set-based SQL (GROUP BY / COUNT), never by materializing rows in Node.
 *
 * OWNERSHIP SCOPING (Phase A3): `listAudits`/`getAudit`/`auditExists` take the
 * authenticated principal and filter `WHERE owner_id = $user.id` — an `admin`
 * skips the predicate (sees all). This is DATA-scoping of the list/detail/
 * existence reads; the per-:id ownership *guard* (404-not-403 enforcement) is
 * Phase A4. Child finding queries are already scoped by `auditId`, so once audit
 * access is established (the controller checks `auditExists` first) no extra
 * child filtering is required — hence `listFindings` keeps its A3 signature.
 *
 * Returns plain JSON-safe DTOs ({@link AuditDto} etc., with ISO date strings).
 * A missing-or-not-visible audit is signalled by a `null`/`undefined` return so
 * the controller owns HTTP status mapping (404), not this layer.
 */
@Injectable()
export class AuditQueryService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * The owner-scope SQL fragment for a given principal (Phase A3). A `user` is
   * restricted to `owner_id = <their id>`; an `admin` gets `true` (no
   * restriction). Returned as a bound `sql` fragment so it can be AND-ed into any
   * WHERE clause injection-safely (the id is a bound parameter, never
   * concatenated). Owner-less rows (`owner_id IS NULL`) do NOT match the `=`
   * predicate, so only admins see pre-migration audits.
   */
  private ownerScope(user: AuthUser): SQL {
    return user.role === 'admin' ? sql`true` : sql`owner_id = ${user.id}`;
  }

  /**
   * List audits newest-first, offset-paginated, with the unpaged total. Scoped
   * to `user` (Phase A3): a `user` sees only their own audits, an `admin` all.
   */
  async listAudits(page: PageParams, user: AuthUser): Promise<Paginated<AuditDto>> {
    const scope = this.ownerScope(user);

    // Two set-based queries: one materializes exactly the requested page
    // (LIMIT/OFFSET, newest-first), the other COUNTs the scoped set. Both share
    // the SAME owner-scope WHERE so `total` matches the visible rows. We never
    // fetch all rows to derive `total` — that's a separate COUNT(*) below.
    const pageResult = await this.db.execute(sql`
      select id, start_url, status, failed_stage, report_path, created_at, updated_at
      from audits
      where ${scope}
      order by created_at desc
      limit ${page.limit} offset ${page.offset}
    `);

    // COUNT(*) comes back as a bigint → the pg driver hands it to us as a string,
    // hence the Number(...) coercion. Same scope so the total is owner-consistent.
    const countResult = await this.db.execute(
      sql`select count(*)::text as total from audits where ${scope}`,
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    const items = pageResult.rows.map((row): AuditDto => this.toAuditDto(row));

    return { items, total, limit: page.limit, offset: page.offset };
  }

  /**
   * Fetch one audit plus its finding rollups (total + zero-filled bySeverity),
   * or `undefined` if no audit has that id OR it is not visible to `user`
   * (Phase A3 owner-scoping; admin sees all). The not-visible and missing cases
   * are indistinguishable on purpose so the controller maps both to 404 without
   * leaking existence (AUTHORIZATION_PLAN §8).
   *
   * Also surfaces `progress`, `coverage`, and `distinctIssues` (Items 14/12/13).
   * `distinctIssues` is computed in Node over the loaded severity rows — findings
   * are fetched in full only for this light aggregation; the column set is minimal
   * (ruleId + url only) to keep the query cheap.
   */
  async getAudit(id: string, user: AuthUser): Promise<AuditDetailDto | undefined> {
    const scope = this.ownerScope(user);

    const auditResult = await this.db.execute(sql`
      select id, start_url, status, failed_stage, report_path, progress, coverage,
             created_at, updated_at
      from audits
      where id = ${id} and ${scope}
      limit 1
    `);

    const auditRow = auditResult.rows[0];
    if (!auditRow) return undefined;

    // Single GROUP BY over this audit's findings: Postgres returns at most one
    // row per severity that actually occurs. We then zero-fill all five enum
    // severities so every SeverityCounts key is present even when a severity has
    // no findings (the GROUP BY simply omits absent severities). No owner
    // predicate needed here — access to the parent audit is already established.
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

    // Item 13: compute distinctIssues from a lightweight findings query
    // (ruleId + url only — no detail column needed).
    const findingsForDistinct = await this.db.execute(sql`
      select rule_id, url
      from findings
      where audit_id = ${id}
    `);
    const distinctIssues = distinctIssueCount(
      findingsForDistinct.rows.map((r) => ({
        ruleId: r.rule_id as string,
        severity: 'info' as Severity, // placeholder — distinctIssueCount doesn't use severity
        confidence: 'high' as Confidence, // placeholder — distinctIssueCount doesn't use confidence
        url: (r.url as string | null) ?? null,
        detail: {},
      })),
    );

    // Item 14 / 12: progress and coverage from the audit row.
    const progress = (auditRow.progress as { stage: string; startedAt: string } | null) ?? null;
    const coverage = (auditRow.coverage as CoverageManifest | null) ?? null;

    return {
      ...this.toAuditDto(auditRow),
      findingsTotal,
      bySeverity,
      progress,
      coverage,
      distinctIssues,
    };
  }

  /**
   * Whether an audit with this id exists AND is visible to `user` (cheap
   * existence check for the controller; Phase A3 owner-scoped, admin bypasses).
   * Returns `false` for a missing id or one owned by someone else alike, so the
   * controller's 404 doesn't leak existence (§8).
   */
  async auditExists(id: string, user: AuthUser): Promise<boolean> {
    const scope = this.ownerScope(user);
    // `select 1 ... limit 1` short-circuits in Postgres: it stops at the first
    // matching row, so existence is O(index-lookup), not a scan/count.
    const result = await this.db.execute(
      sql`select 1 from audits where id = ${id} and ${scope} limit 1`,
    );
    return result.rows.length > 0;
  }

  /**
   * List an audit's findings, filtered by optional severity/ruleId, offset-
   * paginated, with the filtered total. The CALLER establishes audit visibility
   * first via {@link auditExists} (owner-scoped, A3) — so findings are reached
   * only for an audit the principal may see, and the child query needs no extra
   * owner predicate (it is already scoped by `auditId`). That same check also
   * distinguishes "no audit" (404) from "audit with zero findings" (empty page).
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
      select id, rule_id, severity, confidence, url, detail, created_at
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
        // Default to 'high' for pre-migration rows where confidence may be NULL.
        confidence: ((row.confidence as Confidence | null) ?? 'high') as Confidence,
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
