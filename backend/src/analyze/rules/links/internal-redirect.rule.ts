import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `links.internal-redirect` — Internal links pointing to 3xx (should target final URL).
 *
 * Severity: high.
 *
 * SQL mechanism: `links` where `is_redirect = true`, `type='internal'`. Enrichment
 * (Phase 2) set `is_redirect` when the link's crawled target page is a 3xx, so the
 * link should be repointed at the final URL. Findings are emitted on the SOURCE page
 * (the page a dev edits), deduped by distinct `(source_url, href)`.
 */
export const linksInternalRedirectRule: Rule = {
  id: 'links.internal-redirect',
  description: 'Internal links pointing to 3xx (should target final URL)',
  severity: 'high',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select distinct source_url, href, target_status_code
      from links
      where audit_id = ${auditId}
        and type = 'internal'
        and is_redirect = true
    `);
    return result.rows.map((row) => ({
      url: row.source_url as string,
      detail: { href: row.href as string, targetStatusCode: row.target_status_code },
    }));
  },
};
