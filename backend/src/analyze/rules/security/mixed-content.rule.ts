import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `security.mixed-content` — HTTPS page loading HTTP sub-resources (feature 11).
 *
 * Severity: high. Confidence: high. Browser-blockable, downgrades the padlock.
 *
 * Set-based join of `page_resources` (the extractor's non-image + image rows)
 * against `pages`: an HTTP sub-resource (`is_https = false`) referenced by a
 * page whose effective URL is HTTPS. ONE finding per offending resource.
 *
 * detail: `{ src, kind }`.
 */
export const securityMixedContentRule: Rule = {
  id: 'security.mixed-content',
  description: 'HTTPS page loading one or more HTTP (insecure) sub-resources',
  severity: 'high',
  confidence: 'high',
  async run(db, auditId): Promise<Finding[]> {
    const res = await db.execute(sql`
      select distinct pr.page_url as page_url, pr.src as src, pr.kind as kind
      from page_resources pr
      join pages p
        on p.audit_id = pr.audit_id
       and p.url = pr.page_url
      where pr.audit_id = ${auditId}
        and pr.is_https = false
        and p.page_kind = 'html'
        and lower(coalesce(p.final_url, p.url)) like 'https://%'
      order by pr.page_url, pr.src
    `);

    return res.rows.map(
      (row): Finding => ({
        url: row.page_url as string,
        detail: { src: row.src as string, kind: row.kind as string },
      }),
    );
  },
};
