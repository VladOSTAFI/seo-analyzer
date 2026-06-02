import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `meta.title.missing` — Page has no `<title>`.
 *
 * Severity: high. Scoped to successfully-fetched (2xx) HTML pages only — a
 * non-2xx response legitimately has no title.
 *
 * SQL mechanism: `jsonb_array_length(title) = 0`.
 */
export const metaTitleMissingRule: Rule = {
  id: 'meta.title.missing',
  description: 'Page has no `<title>`',
  severity: 'high',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select url
      from pages
      where audit_id = ${auditId}
        and status_class = '2xx'
        and jsonb_array_length(title) = 0
      order by url
    `);
    return res.rows.map((r) => ({ url: r.url as string, detail: {} }));
  },
};
