import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { InvalidArgumentError } from '../common/errors';
import { DB, type Database } from '../db/db.types';
import { AuditRepository } from '../audit/audit.repository';
import { findings, type NewFinding } from '../db/schema';
import type { Severity } from './rule.types';
import { RULES } from './rule.registry';
import type { AnalyzeSummary } from './analyze.types';

/** Insert batch size for chunked bulk inserts (mirrors crawl/enrich). */
const INSERT_CHUNK_SIZE = 500;

/** All severities, zero-filled, so the summary always has every key present. */
const SEVERITY_KEYS: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

/** Split an array into fixed-size chunks for batched inserts. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Read a single integer aggregate (e.g. `count(*)`) from an `execute` result.
 * node-postgres returns `{ rows: [...] }`; the aggregate column is `n`. Coerces
 * Postgres' bigint-as-string defensively so callers always get a JS number.
 */
function scalarCount(result: { rows: Record<string, unknown>[] }): number {
  const value = result.rows[0]?.n;
  return value == null ? 0 : Number(value);
}

/**
 * Phase 3 analysis engine (§"Phase 3 — Analysis Engine", §6 catalogue, §8). Runs
 * every registered {@link import('./rule.types').Rule} as set-based SQL (no
 * row-by-row Node work) and persists the emitted findings.
 *
 * All work happens inside ONE transaction that first deletes this audit's prior
 * findings (idempotent — a re-run reproduces the same set) then inserts the new
 * ones in chunked batches. Each rule's `run` is wrapped in its own try/catch so a
 * single misbehaving check cannot void the whole report — the failing rule id is
 * collected into the summary and analysis continues. A DB/transaction-level error
 * still propagates to the outer catch, which marks the audit failed and rethrows.
 *
 * Status semantics mirror Phase 1/2: status is set to `analyzing` at the start and
 * LEFT at `analyzing` on success — `analyzing` is the settled state until the
 * reporting stage advances it (there is no `analyzed` enum value).
 */
@Injectable()
export class AnalyzeService {
  private readonly logger = new Logger(AnalyzeService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly auditRepo: AuditRepository,
  ) {}

  async analyze(auditId: string): Promise<AnalyzeSummary> {
    const startedAt = Date.now();
    await this.auditRepo.assertExists(auditId);

    // Guard: analysis is meaningless without crawl output. We deliberately do NOT
    // hard-require status === 'enriching': status is a forward-only single value,
    // and re-analyzing an audit already at `analyzing`/`reporting`/`done` is valid.
    // A pages-count check is the robust signal that the upstream stages ran — zero
    // pages almost always means `audit:crawl`/`audit:enrich` were never run.
    const pageCount = scalarCount(
      await this.db.execute(sql`select count(*)::int as n from pages where audit_id = ${auditId}`),
    );
    if (pageCount === 0) {
      throw new InvalidArgumentError(
        `No crawled pages for audit "${auditId}". ` +
          `Run \`audit:crawl ${auditId}\` then \`audit:enrich ${auditId}\` first.`,
      );
    }

    await this.auditRepo.setStatus(auditId, 'analyzing');
    this.logger.log(`Analyze start audit=${auditId} pages=${pageCount} rules=${RULES.length}`);

    try {
      const summary = await this.db.transaction(async (tx) => {
        // Clear prior findings first so the run is fully idempotent.
        await tx.delete(findings).where(eq(findings.auditId, auditId));

        const rows: NewFinding[] = [];
        const failedRules: string[] = [];

        // Sequential by design: a single pg connection inside a transaction is
        // serial, so do NOT Promise.all the rules. Each rule is isolated so one
        // bad check doesn't abort the other 26.
        for (const rule of RULES) {
          try {
            const found = await rule.run(tx, auditId);
            for (const f of found) {
              rows.push({
                auditId,
                ruleId: rule.id,
                // Per-finding override wins over the rule's static default, so a
                // single rule can grade rows differently (e.g. mobile perf flags
                // escalated over desktop) without splitting into two rules.
                severity: f.severity ?? rule.severity,
                confidence: f.confidence ?? rule.confidence ?? 'high',
                url: f.url,
                detail: f.detail ?? {},
              });
            }
          } catch (ruleErr) {
            failedRules.push(rule.id);
            const reason = ruleErr instanceof Error ? ruleErr.message : String(ruleErr);
            this.logger.error(`Rule failed audit=${auditId} rule=${rule.id}: ${reason}`);
          }
        }

        // Batch-insert all collected rows; skip the write when there are none.
        for (const part of chunk(rows, INSERT_CHUNK_SIZE)) {
          if (part.length) await tx.insert(findings).values(part);
        }

        return this.buildSummary(rows, failedRules);
      });

      const elapsedMs = Date.now() - startedAt;
      this.logger.log(
        `Analyze done audit=${auditId} findings=${summary.totalFindings} ` +
          `(critical=${summary.bySeverity.critical}, high=${summary.bySeverity.high}, ` +
          `medium=${summary.bySeverity.medium}, low=${summary.bySeverity.low}, ` +
          `info=${summary.bySeverity.info}) rules_run=${summary.rulesRun} ` +
          `rules_failed=${summary.failedRules.length} durationMs=${elapsedMs}`,
      );
      // Status stays at `analyzing` on success — reporting owns the next transition.
      return summary;
    } catch (err) {
      await this.auditRepo.markFailed(auditId, 'analyze');
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Analyze failed audit=${auditId} stage=analyze: ${reason}`);
      throw err;
    }
  }

  /**
   * Fold the persisted rows into the {@link AnalyzeSummary}: total, per-severity
   * (zero-filled across all keys) and per-rule (only rules that produced findings).
   */
  private buildSummary(rows: NewFinding[], failedRules: string[]): AnalyzeSummary {
    const bySeverity = Object.fromEntries(SEVERITY_KEYS.map((s) => [s, 0])) as Record<
      Severity,
      number
    >;
    const byRule: Record<string, number> = {};

    for (const row of rows) {
      bySeverity[row.severity] += 1;
      byRule[row.ruleId] = (byRule[row.ruleId] ?? 0) + 1;
    }

    return {
      totalFindings: rows.length,
      bySeverity,
      byRule,
      rulesRun: RULES.length,
      failedRules,
    };
  }
}
