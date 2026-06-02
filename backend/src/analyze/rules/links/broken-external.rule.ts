import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `links.broken-external` — External links to 4xx/5xx.
 *
 * Severity: medium.
 *
 * SQL mechanism: `links` where `is_broken = true`, `type='external'`. External link
 * targets are usually NOT crawled, so their flags are NULL and this rule only fires
 * when an external URL happened to be crawled within the same audit. A live HEAD-check
 * pass over external targets is a deliberate, deferred enhancement (no network here).
 * Findings emit on the SOURCE page, deduped by distinct `(source_url, href)`.
 */
export const linksBrokenExternalRule: Rule = {
  id: 'links.broken-external',
  description: 'External links to 4xx/5xx',
  severity: 'medium',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select distinct source_url, href, target_status_code
      from links
      where audit_id = ${auditId}
        and type = 'external'
        and is_broken = true
    `);
    return result.rows.map((row) => ({
      url: row.source_url as string,
      detail: { href: row.href as string, targetStatusCode: row.target_status_code },
    }));
  },
};
