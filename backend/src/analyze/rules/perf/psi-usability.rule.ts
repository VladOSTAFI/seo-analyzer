import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `perf.psi-usability` — Critical PSI usability/opportunity recommendations.
 *
 * Severity: medium.
 *
 * SQL mechanism: `performance` where `jsonb_array_length(usability_flags) > 0`,
 * one finding per (page_url, strategy); detail carries the `flags` array +
 * `strategy`. `usability_flags` defaults to `[]` and is always written as an
 * array, so `jsonb_array_length` is safe (never a JSON null). node-postgres
 * returns the jsonb already parsed as a JS array.
 */
export const perfPsiUsabilityRule: Rule = {
  id: 'perf.psi-usability',
  description: 'Critical PSI usability/opportunity recommendations',
  severity: 'medium',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select page_url, strategy, usability_flags
      from performance
      where audit_id = ${auditId}
        and jsonb_array_length(usability_flags) > 0
      order by page_url, strategy
    `);
    return result.rows.map(
      (row): Finding => ({
        url: row.page_url as string,
        detail: {
          strategy: row.strategy as string,
          flags: row.usability_flags as string[],
        },
      }),
    );
  },
};
