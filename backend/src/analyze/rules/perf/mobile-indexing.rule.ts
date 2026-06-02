import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `perf.mobile-indexing` — Mobile usability / indexing issues from PSI mobile data.
 *
 * Severity: high.
 *
 * SQL mechanism: `performance` where `strategy = 'mobile'` AND
 * `jsonb_array_length(usability_flags) > 0` — the mobile-only subset of
 * usability failures, weighted separately because Google indexes mobile-first.
 * One finding per page_url; detail carries the `flags` array + `strategy`.
 */
export const perfMobileIndexingRule: Rule = {
  id: 'perf.mobile-indexing',
  description: 'Mobile usability / indexing issues from PSI mobile data',
  severity: 'high',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select page_url, usability_flags
      from performance
      where audit_id = ${auditId}
        and strategy = 'mobile'
        and jsonb_array_length(usability_flags) > 0
      order by page_url
    `);
    return result.rows.map(
      (row): Finding => ({
        url: row.page_url as string,
        detail: {
          strategy: 'mobile',
          flags: row.usability_flags as string[],
        },
      }),
    );
  },
};
