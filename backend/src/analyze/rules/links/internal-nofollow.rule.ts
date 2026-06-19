import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `links.internal-nofollow` — Internal links carrying `rel="nofollow"`.
 *
 * Severity: low. Confidence: high.
 *
 * `rel="nofollow"` on an INTERNAL link sculpts/leaks PageRank and is almost
 * always accidental (CMS defaults, login/cart links). This is distinct from
 * `links.external-flag`, which handles monetized EXTERNAL links. Set-based scan
 * of `links` where `type = 'internal'` and the `rel` jsonb string array contains
 * `nofollow`, tested with the `@>` containment operator (same idiom as
 * `links.external-flag`). Findings are emitted on the SOURCE page, deduped by
 * distinct `(source_url, href)`.
 *
 * Detail: `{ href, rel }`.
 */
export const linksInternalNofollowRule: Rule = {
  id: 'links.internal-nofollow',
  description: 'Internal links carrying rel="nofollow" (accidental PageRank sculpting)',
  severity: 'low',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select distinct source_url, href, rel
      from links
      where audit_id = ${auditId}
        and type = 'internal'
        and rel @> '["nofollow"]'::jsonb
      order by source_url, href
    `);

    return result.rows.map(
      (row): Finding => ({
        url: row.source_url as string,
        detail: { href: row.href as string, rel: row.rel },
      }),
    );
  },
};
