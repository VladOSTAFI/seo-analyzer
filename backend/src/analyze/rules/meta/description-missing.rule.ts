import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `meta.description.missing` — No meta description.
 *
 * Severity: medium. Scoped to successfully-fetched (2xx) HTML pages only (content-type gated).
 *
 * SQL mechanism: `jsonb_array_length(meta_description) = 0`.
 */
export const metaDescriptionMissingRule: Rule = {
  id: 'meta.description.missing',
  description: 'No meta description',
  severity: 'medium',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select url
      from pages
      where audit_id = ${auditId}
        and status_class = '2xx'
        and (content_type is null or content_type like 'text/html%')
        and jsonb_array_length(meta_description) = 0
      order by url
    `);
    return res.rows.map((r) => ({ url: r.url as string, detail: {} }));
  },
};
