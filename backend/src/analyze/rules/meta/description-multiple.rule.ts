import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `meta.description.multiple` — Multiple meta descriptions on one page.
 *
 * Severity: low. Scoped to successfully-fetched (2xx) HTML pages only.
 *
 * SQL mechanism: `jsonb_array_length(meta_description) > 1`.
 */
export const metaDescriptionMultipleRule: Rule = {
  id: 'meta.description.multiple',
  description: 'Multiple meta descriptions on one page',
  severity: 'low',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select url, meta_description, jsonb_array_length(meta_description) as cnt
      from pages
      where audit_id = ${auditId}
        and status_class = '2xx'
        and jsonb_array_length(meta_description) > 1
      order by url
    `);
    return res.rows.map((r) => ({
      url: r.url as string,
      detail: { descriptions: r.meta_description, count: Number(r.cnt) },
    }));
  },
};
