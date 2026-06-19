import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `links.external-redirect` — Outbound links whose probed target is a 3xx.
 *
 * Severity: info. Confidence: medium (probed, lower-trust live status).
 *
 * Sibling of `links.broken-external` (feature 10 §3.3): where that rule surfaces
 * 4xx/5xx outbound targets, this one surfaces redirecting (3xx) outbound targets
 * so the report can recommend pointing the link at the final destination. Reads
 * the `target_status_code` populated by the external-link probe pass (gated by
 * EXTERNAL_VERIFY_ENABLED) — silent until that pass runs. Set-based scan of
 * `links` where `type='external'` and `target_status_code between 300 and 399`,
 * deduped by distinct `(source_url, href)`; findings emit on the SOURCE page.
 *
 * Detail: `{ href, targetStatusCode }`.
 */
export const linksExternalRedirectRule: Rule = {
  id: 'links.external-redirect',
  description: 'Outbound external links resolving through a 3xx redirect',
  severity: 'info',
  confidence: 'medium',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select distinct source_url, href, target_status_code
      from links
      where audit_id = ${auditId}
        and type = 'external'
        and target_status_code between 300 and 399
    `);
    return result.rows.map(
      (row): Finding => ({
        url: row.source_url as string,
        confidence: 'medium',
        detail: { href: row.href as string, targetStatusCode: row.target_status_code },
      }),
    );
  },
};
