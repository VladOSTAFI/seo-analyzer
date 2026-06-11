import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `perf.cls-inp` — Cumulative Layout Shift or Interaction to Next Paint above
 * the "good" thresholds.
 *
 * Severity: high.
 *
 * SQL mechanism: two UNION-ed selects over `performance` rows where
 * `cls > 0.1 OR inp_ms > 200`:
 *
 * 1. Non-fallback rows (`is_origin_fallback = false`): one finding per
 *    (page_url, strategy) at default (high) confidence. Detail carries
 *    `cls`, `inpMs`, `strategy`, and an `issues` array.
 *
 * 2. Origin-fallback rows (`is_origin_fallback = true`): PSI returned
 *    ORIGIN-level CrUX aggregates rather than page-level data, so the same
 *    CLS/INP values were written to every sampled page. These are collapsed
 *    into ONE site-level finding per strategy (url = null) with
 *    `confidence: 'low'` and detail `{ scope: 'origin', strategy, cls, inpMs,
 *    issues }` — where `cls`/`inpMs` are MAX across fallback rows for that
 *    strategy. SQL `>` against NULL operands yields NULL (not matched), so a
 *    row with one metric absent is handled correctly by the `OR`.
 */
export const perfClsInpRule: Rule = {
  id: 'perf.cls-inp',
  description: 'CLS > 0.1 or INP > 200ms',
  severity: 'high',
  async run(db, auditId) {
    const result = await db.execute(sql`
      -- Per-page findings for rows with real page-level CrUX data.
      select
        page_url,
        strategy,
        cls,
        inp_ms,
        false as origin_fallback
      from performance
      where audit_id           = ${auditId}
        and (cls > 0.1 or inp_ms > 200)
        and is_origin_fallback = false

      union all

      -- One site-level finding per strategy when rows are origin-level fallback.
      select
        null          as page_url,
        strategy,
        max(cls)      as cls,
        max(inp_ms)   as inp_ms,
        true          as origin_fallback
      from performance
      where audit_id           = ${auditId}
        and (cls > 0.1 or inp_ms > 200)
        and is_origin_fallback = true
      group by strategy

      order by page_url, strategy
    `);

    return result.rows.map((row): Finding => {
      const isOriginFallback = row.origin_fallback as boolean;
      const cls = row.cls as number | null;
      const inpMs = row.inp_ms as number | null;
      const issues: string[] = [];
      if (cls !== null && cls > 0.1) issues.push('cls');
      if (inpMs !== null && inpMs > 200) issues.push('inp');

      if (isOriginFallback) {
        return {
          url: null,
          confidence: 'low',
          detail: {
            scope: 'origin',
            strategy: row.strategy as string,
            cls,
            inpMs,
            issues,
          },
        };
      }
      return {
        url: row.page_url as string,
        detail: {
          strategy: row.strategy as string,
          cls,
          inpMs,
          issues,
        },
      };
    });
  },
};
