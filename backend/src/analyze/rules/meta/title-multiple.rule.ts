import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `meta.title.multiple` — Page has more than one `<title>`.
 *
 * Severity: medium. Scoped to successfully-fetched (2xx) HTML pages only (content-type gated).
 *
 * SQL mechanism: `jsonb_array_length(title) > 1`.
 */
export const metaTitleMultipleRule: Rule = {
  id: 'meta.title.multiple',
  description: 'Page has more than one `<title>`',
  severity: 'medium',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select url, title, jsonb_array_length(title) as cnt
      from pages
      where audit_id = ${auditId}
        and status_class = '2xx'
        and (content_type is null or content_type like 'text/html%')
        and jsonb_array_length(title) > 1
      order by url
    `);
    return res.rows.map((r) => ({
      url: r.url as string,
      detail: { titles: r.title, count: Number(r.cnt) },
    }));
  },
};
