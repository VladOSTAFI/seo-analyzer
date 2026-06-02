import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `links.external-flag` — External links lacking a `nofollow`/`sponsored`/`ugc` rel token.
 *
 * Severity: low.
 *
 * SQL mechanism: `links` where `type='external'` and `rel` (a jsonb string array)
 * contains NONE of `nofollow`/`sponsored`/`ugc`. Intentionally broad/low-severity —
 * it surfaces every external link missing those rel tokens (a hint, not a hard error).
 * Containment is tested with the jsonb `@>` operator. Findings emit on the SOURCE
 * page, deduped by distinct `(source_url, href)`.
 */
export const linksExternalFlagRule: Rule = {
  id: 'links.external-flag',
  description: 'External links missing `rel="nofollow"`/sponsored where expected',
  severity: 'low',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select distinct source_url, href, rel
      from links
      where audit_id = ${auditId}
        and type = 'external'
        and not (
          rel @> '["nofollow"]'::jsonb
          or rel @> '["sponsored"]'::jsonb
          or rel @> '["ugc"]'::jsonb
        )
    `);
    return result.rows.map((row) => ({
      url: row.source_url as string,
      detail: { href: row.href as string, rel: row.rel },
    }));
  },
};
