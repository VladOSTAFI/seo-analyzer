import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `links.external-flag` — External links lacking a `nofollow`/`sponsored`/`ugc`
 * rel token on hrefs that look monetized (affiliate/UTM/referral patterns).
 *
 * Severity: low.
 *
 * Narrowed to monetized-looking hrefs only (Item 6) — plain external links
 * without rel attributes are intentionally ignored; this rule surfaces the subset
 * that SHOULD carry rel for SEO/compliance reasons:
 *   - UTM-tracked links  (`?utm_*`)
 *   - Referral links     (`?ref=`, `?ref_=`, etc.)
 *   - Affiliate paths    (`/aff`, `/affiliate`, `/go/`, `/recommends/`, etc.)
 *
 * SQL mechanism: `links` where `type='external'`, href matches one of the
 * monetized patterns, and `rel` (jsonb string array) contains NONE of
 * `nofollow`/`sponsored`/`ugc`. Containment tested with the jsonb `@>` operator.
 * Findings emitted on the SOURCE page, deduped by distinct `(source_url, href)`.
 */
export const linksExternalFlagRule: Rule = {
  id: 'links.external-flag',
  description: 'Monetized external links missing `rel="nofollow"`/sponsored where expected',
  severity: 'low',

  async run(db, auditId) {
    const result = await db.execute(sql`
      select distinct source_url, href, rel
      from links
      where audit_id = ${auditId}
        and type = 'external'
        and (
          href ilike '%utm_%'
          or href ilike '%?ref=%'
          or href ilike '%&ref=%'
          or href ilike '%/aff%'
          or href ilike '%/go/%'
          or href ilike '%/recommends/%'
        )
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
