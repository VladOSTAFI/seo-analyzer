import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

// Prevalence rollup threshold: flags appearing on this fraction of sampled pages
// (per strategy) are collapsed into one site-level finding instead of per-page rows.
const rollupPct = Number(process.env.PERF_FLAG_ROLLUP_PCT) || 0.6;

/**
 * `perf.psi-usability` — Critical PSI usability/opportunity recommendations.
 *
 * Severity: medium (static); mobile strategy findings are escalated to `high`
 * via per-finding severity override (Item 4 — replaces the old
 * `perf.mobile-indexing` rule so we don't double-count the mobile subset).
 *
 * Item 5 — Prevalence rollup: when a given (flag, strategy) pair appears on
 * ≥ `PERF_FLAG_ROLLUP_PCT` (default 0.6) of sampled pages for that strategy,
 * the rule emits ONE site-level finding (`url = null`) with
 * `detail: { flag, strategy, affectedPages, totalPages }` and SUPPRESSES the
 * individual per-page rows for that flag+strategy. Flags below the threshold
 * remain as per-page findings.
 *
 * SQL mechanism: two queries run in one `Promise.all`:
 *   1. Rollup query — identifies prevalent flag+strategy pairs via set-based
 *      aggregation with a HAVING threshold.
 *   2. Per-page query — existing per-(page_url, strategy) rows whose flags are
 *      filtered to only those NOT covered by the rollup.
 *
 * `usability_flags` defaults to `[]` and is always written as an array, so
 * `jsonb_array_length` / `jsonb_array_elements_text` are safe (never a JSON null).
 */
export const perfPsiUsabilityRule: Rule = {
  id: 'perf.psi-usability',
  description: 'Critical PSI usability/opportunity recommendations',
  severity: 'medium',

  async run(db, auditId) {
    // ── 1. Rollup: flag+strategy pairs that exceed the prevalence threshold ──
    const rollupResult = await db.execute(sql`
      select
        p.strategy,
        flag,
        count(*)::int                                                         as affected,
        (select count(*)::int
           from performance
          where audit_id = ${auditId}
            and strategy = p.strategy)                                        as total
      from performance p,
           jsonb_array_elements_text(p.usability_flags) as flag
      where p.audit_id = ${auditId}
      group by p.strategy, flag
      having count(*) >= ${rollupPct} *
        (select count(*)
           from performance
          where audit_id = ${auditId}
            and strategy = p.strategy)
    `);

    // Build a Set of "strategy|flag" keys that are rolled up so the per-page
    // query knows which flags to suppress.
    const rolledUpKeys = new Set<string>();
    for (const r of rollupResult.rows) {
      rolledUpKeys.add(`${r.strategy as string}|${r.flag as string}`);
    }

    // ── 2. Per-page rows: only flags NOT covered by the rollup ──
    const perPageResult = await db.execute(sql`
      select page_url, strategy, usability_flags
      from performance
      where audit_id = ${auditId}
        and jsonb_array_length(usability_flags) > 0
      order by page_url, strategy
    `);

    const findings: Finding[] = [];

    // ── 3. Emit site-level rollup findings ──
    for (const r of rollupResult.rows) {
      const strategy = r.strategy as string;
      const flag = r.flag as string;
      const affectedPages = r.affected as number;
      const totalPages = r.total as number;
      findings.push({
        url: null,
        detail: { flag, strategy, affectedPages, totalPages },
        // Mobile escalation applies to rollup rows too (Item 4).
        ...(strategy === 'mobile' ? { severity: 'high' as const } : {}),
      });
    }

    // ── 4. Emit per-page findings for below-threshold flags ──
    for (const row of perPageResult.rows) {
      const strategy = row.strategy as string;
      const allFlags = row.usability_flags as string[];

      // Keep only flags not rolled up for this strategy.
      const remainingFlags = allFlags.filter((flag) => !rolledUpKeys.has(`${strategy}|${flag}`));

      if (remainingFlags.length === 0) continue;

      findings.push({
        url: row.page_url as string,
        detail: {
          strategy,
          flags: remainingFlags,
        },
        // Item 4: mobile per-page findings escalated to high severity.
        ...(strategy === 'mobile' ? { severity: 'high' as const } : {}),
      });
    }

    return findings;
  },
};
