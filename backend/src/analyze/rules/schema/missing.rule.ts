import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `schema.missing` — HTML 2xx page carries NO structured data at all.
 *
 * Severity: medium. Confidence: high (directly observed absence of markup).
 *
 * SQL mechanism: LEFT JOIN `structured_data` onto live HTML pages keyed by
 * (audit_id, url=page_url); flag pages with no matching JSON-LD row.
 */
export const schemaMissingRule: Rule = {
  id: 'schema.missing',
  description: 'Page has no Schema.org / JSON-LD structured data',
  severity: 'medium',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select p.url as url
      from pages p
      left join structured_data sd
        on sd.audit_id = p.audit_id and sd.page_url = p.url
      where p.audit_id = ${auditId}
        and p.status_class = '2xx'
        and p.page_kind = 'html'
        and sd.id is null
      order by p.url
    `);
    return res.rows.map((r) => ({ url: r.url as string, detail: {} }));
  },
};
