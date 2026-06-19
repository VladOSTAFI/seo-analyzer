import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

// Minimum acceptable Lighthouse performance score (0–100).
// Pages scoring below this threshold are flagged.
const labScoreMin = Number(process.env.PERF_LAB_SCORE_MIN) || 90;

/**
 * `perf.lab-score` — Lighthouse performance score below threshold.
 *
 * Severity: medium (static default); per-finding override escalates to `high`
 * when the score is critically low (< 50), signalling pages that need urgent
 * attention.
 *
 * SQL mechanism: `performance` where `performance_score < PERF_LAB_SCORE_MIN`,
 * one finding per (page_url, strategy). NULL scores (PSI returned no lab data)
 * are excluded because `NULL < n` evaluates to NULL in SQL, not TRUE.
 * The `performance_score` column is `real` (0–100).
 *
 * Per-finding severity:
 *   - score < 50  → `high`
 *   - otherwise   → falls back to rule's static `medium`
 */
export const perfLabScoreRule: Rule = {
  id: 'perf.lab-score',
  description: 'Lighthouse performance score below threshold',
  severity: 'medium',

  async run(db, auditId) {
    const result = await db.execute(sql`
      select page_url, strategy, performance_score
      from performance
      where audit_id = ${auditId}
        and performance_score is not null
        and performance_score < ${labScoreMin}
      order by page_url, strategy
    `);

    return result.rows.map((row): Finding => {
      const score = row.performance_score as number;
      const strategy = row.strategy as string;
      return {
        url: row.page_url as string,
        detail: { strategy, score },
        // Escalate critically-low scores to high severity.
        ...(score < 50 ? { severity: 'high' as const } : {}),
      };
    });
  },
};
