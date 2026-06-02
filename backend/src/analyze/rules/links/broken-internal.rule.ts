import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `links.broken-internal` — Internal links to 4xx/5xx.
 *
 * Severity: critical.
 *
 * SQL mechanism: `links` where `is_broken = true`, `type='internal'`. Enrichment
 * (Phase 2) set `is_broken` when the link's crawled target page is 4xx/5xx. Findings
 * are emitted on the SOURCE page, deduped by distinct `(source_url, href)`.
 */
export const linksBrokenInternalRule: Rule = {
  id: 'links.broken-internal',
  description: 'Internal links to 4xx/5xx',
  severity: 'critical',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select distinct source_url, href, target_status_code
      from links
      where audit_id = ${auditId}
        and type = 'internal'
        and is_broken = true
    `);
    return result.rows.map((row) => ({
      url: row.source_url as string,
      detail: { href: row.href as string, targetStatusCode: row.target_status_code },
    }));
  },
};
