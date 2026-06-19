import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `security.hsts` — HTTPS page missing a Strict-Transport-Security header
 * (feature 11).
 *
 * Severity: low. Confidence: high. HTML pages served over HTTPS only.
 *
 * HSTS instructs browsers to always use HTTPS for the host, closing the
 * downgrade/SSL-strip window. Flags HTTPS pages whose captured `hsts` column is
 * null/empty.
 *
 * detail: `{ }` (presence-only).
 */
export const securityHstsRule: Rule = {
  id: 'security.hsts',
  description: 'HTTPS page missing a Strict-Transport-Security (HSTS) header',
  severity: 'low',
  confidence: 'high',
  async run(db, auditId): Promise<Finding[]> {
    const res = await db.execute(sql`
      select url
      from pages
      where audit_id = ${auditId}
        and page_kind = 'html'
        and lower(coalesce(final_url, url)) like 'https://%'
        and (hsts is null or hsts = '')
      order by url
    `);

    return res.rows.map((row): Finding => ({ url: row.url as string, detail: {} }));
  },
};
