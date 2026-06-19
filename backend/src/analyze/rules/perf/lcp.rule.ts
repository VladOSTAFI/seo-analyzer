import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `perf.lcp` — Largest Contentful Paint above the "good" threshold (>2.5s).
 *
 * Severity: high.
 *
 * SQL mechanism: two UNION-ed selects over `performance` rows where `lcp_ms > 2500`:
 *
 * 1. Non-fallback rows (`is_origin_fallback = false`): one finding per
 *    (page_url, strategy) at default (high) confidence. Detail carries
 *    `lcpMs` + `strategy`.
 *
 * 2. Origin-fallback rows (`is_origin_fallback = true`): PSI returned ORIGIN-level
 *    CrUX aggregates rather than page-level data, so the same LCP value was
 *    written to every sampled page. These are collapsed into ONE site-level
 *    finding per strategy (url = null) with `confidence: 'low'` and detail
 *    `{ scope: 'origin', strategy, lcpMs }` — where `lcpMs` is the MAX across
 *    all fallback rows for that strategy (representative value). This prevents
 *    identical origin-level data from generating one false per-page finding on
 *    every sample. NULL `lcp_ms` rows do not satisfy `> 2500` and are excluded.
 */
export const perfLcpRule: Rule = {
  id: 'perf.lcp',
  description: 'LCP above the "good" threshold (>2.5s)',
  severity: 'high',
  async run(db, auditId) {
    const result = await db.execute(sql`
      -- Per-page findings for rows with real page-level CrUX data.
      select
        page_url,
        strategy,
        lcp_ms,
        false  as origin_fallback
      from performance
      where audit_id      = ${auditId}
        and lcp_ms        > 2500
        and is_origin_fallback = false

      union all

      -- One site-level finding per strategy when all rows are origin-level fallback.
      select
        null        as page_url,
        strategy,
        max(lcp_ms) as lcp_ms,
        true        as origin_fallback
      from performance
      where audit_id           = ${auditId}
        and lcp_ms             > 2500
        and is_origin_fallback = true
      group by strategy

      order by page_url, strategy
    `);

    return result.rows.map((row): Finding => {
      const isOriginFallback = row.origin_fallback as boolean;
      if (isOriginFallback) {
        return {
          url: null,
          confidence: 'low',
          detail: {
            scope: 'origin',
            strategy: row.strategy as string,
            lcpMs: row.lcp_ms as number,
          },
        };
      }
      return {
        url: row.page_url as string,
        detail: {
          strategy: row.strategy as string,
          lcpMs: row.lcp_ms as number,
        },
      };
    });
  },
};
