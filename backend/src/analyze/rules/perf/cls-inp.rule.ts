import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `perf.cls-inp` — Cumulative Layout Shift or Interaction to Next Paint above
 * the "good" thresholds.
 *
 * Severity: high.
 *
 * SQL mechanism: `performance` where `cls > 0.1 OR inp_ms > 200`, one finding
 * per (page_url, strategy); detail carries both `cls` and `inpMs` (either may
 * be null — kept as null, not coerced) plus the `strategy`, and an `issues`
 * array naming which threshold(s) tripped. SQL `>` against a NULL operand
 * yields NULL (not matched), so a row with one metric absent is handled
 * correctly by the `OR`.
 */
export const perfClsInpRule: Rule = {
  id: 'perf.cls-inp',
  description: 'CLS > 0.1 or INP > 200ms',
  severity: 'high',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select page_url, strategy, cls, inp_ms
      from performance
      where audit_id = ${auditId}
        and (cls > 0.1 or inp_ms > 200)
      order by page_url, strategy
    `);
    return result.rows.map((row): Finding => {
      const cls = row.cls as number | null;
      const inpMs = row.inp_ms as number | null;
      const issues: string[] = [];
      if (cls !== null && cls > 0.1) issues.push('cls');
      if (inpMs !== null && inpMs > 200) issues.push('inp');
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
