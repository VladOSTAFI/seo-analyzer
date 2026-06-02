import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `meta.h1.missing` — No `<h1>`.
 *
 * Severity: high. Scoped to successfully-fetched (2xx) HTML pages only.
 *
 * SQL mechanism: `jsonb_array_length(h1) = 0`.
 */
export const metaH1MissingRule: Rule = {
  id: 'meta.h1.missing',
  description: 'No `<h1>`',
  severity: 'high',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select url
      from pages
      where audit_id = ${auditId}
        and status_class = '2xx'
        and jsonb_array_length(h1) = 0
      order by url
    `);
    return res.rows.map((r) => ({ url: r.url as string, detail: {} }));
  },
};
