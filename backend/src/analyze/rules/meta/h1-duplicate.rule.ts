import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `meta.h1.duplicate` — Same H1 text (first `<h1>`) shared by 2+ pages.
 *
 * Severity: low. Scoped to successfully-fetched (2xx) HTML pages that have at
 * least one h1. Inner GROUP BY on `h1->>0` HAVING count > 1, joined back to
 * pages so ONE finding is emitted per affected page.
 *
 * detail: `{ h1, duplicateCount }`.
 */
export const metaH1DuplicateRule: Rule = {
  id: 'meta.h1.duplicate',
  description: 'Duplicate H1 text across pages',
  severity: 'low',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select p.url, p.h1->>0 as val, d.cnt
      from pages p
      join (
        select h1->>0 as val, count(*) as cnt
        from pages
        where audit_id = ${auditId}
          and status_class = '2xx'
          and jsonb_array_length(h1) >= 1
        group by h1->>0
        having count(*) > 1
      ) d on (p.h1->>0) = d.val
      where p.audit_id = ${auditId}
        and p.status_class = '2xx'
        and jsonb_array_length(p.h1) >= 1
      order by p.url
    `);
    return res.rows.map((r) => ({
      url: r.url as string,
      detail: { h1: r.val, duplicateCount: Number(r.cnt) },
    }));
  },
};
