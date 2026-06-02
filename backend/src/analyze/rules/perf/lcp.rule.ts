import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `perf.lcp` — Largest Contentful Paint above the "good" threshold (>2.5s).
 *
 * Severity: high.
 *
 * SQL mechanism: `performance` where `lcp_ms > 2500`, one finding per
 * (page_url, strategy); detail carries `lcpMs` + `strategy`. NULL `lcp_ms`
 * (PSI had no field data) does not satisfy `> 2500`, so it is excluded.
 */
export const perfLcpRule: Rule = {
  id: 'perf.lcp',
  description: 'LCP above the "good" threshold (>2.5s)',
  severity: 'high',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select page_url, strategy, lcp_ms
      from performance
      where audit_id = ${auditId}
        and lcp_ms > 2500
      order by page_url, strategy
    `);
    return result.rows.map(
      (row): Finding => ({
        url: row.page_url as string,
        detail: {
          strategy: row.strategy as string,
          lcpMs: row.lcp_ms as number,
        },
      }),
    );
  },
};
