import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `meta.h1.multiple` — Multiple `<h1>` on one page.
 *
 * Severity: medium. Scoped to successfully-fetched (2xx) HTML pages only.
 *
 * SQL mechanism: `jsonb_array_length(h1) > 1`.
 */
export const metaH1MultipleRule: Rule = {
  id: 'meta.h1.multiple',
  description: 'Multiple `<h1>` on one page',
  severity: 'medium',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select url, h1, jsonb_array_length(h1) as cnt
      from pages
      where audit_id = ${auditId}
        and status_class = '2xx'
        and jsonb_array_length(h1) > 1
      order by url
    `);
    return res.rows.map((r) => ({
      url: r.url as string,
      detail: { h1s: r.h1, count: Number(r.cnt) },
    }));
  },
};
