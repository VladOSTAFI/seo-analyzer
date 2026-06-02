import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `mirror.main-mirror` — Site reachable on multiple host/scheme variants
 * (www/non-www, http/https) without a canonical redirect.
 *
 * Severity: high.
 *
 * SQL mechanism: among crawled 2xx pages, derive a `variant_key` (the
 * scheme-less, leading-`www.`-stripped `host[/path?query]`) and the page's real
 * `variant` origin (`scheme://host`). Group by `variant_key` and flag any group
 * served under 2+ distinct origins — the same logical page is live on multiple
 * mirrors. One finding is emitted PER affected page (more actionable than a
 * single site-wide finding), carrying the shared key, the distinct mirror
 * origins, and the mirror count.
 *
 * Note: most crawls return ZERO findings here because the crawler dedups by
 * normalized URL and typically seeds a single origin — a real mirror only
 * surfaces when multiple origins were actually crawled.
 */
export const mirrorMainMirrorRule: Rule = {
  id: 'mirror.main-mirror',
  description:
    'Site reachable on multiple host/scheme variants (www/non-www, http/https) without canonical redirect',
  severity: 'high',
  async run(db, auditId): Promise<Finding[]> {
    const result = await db.execute(sql`
      with variants as (
        select
          url,
          regexp_replace(regexp_replace(url, '^https?://', ''), '^www\\.', '') as variant_key,
          regexp_replace(url, '(^https?://[^/]+).*', '\\1') as variant
        from pages
        where audit_id = ${auditId}
          and status_class = '2xx'
      ),
      mirrored as (
        select
          variant_key,
          count(distinct variant) as mirror_count,
          array_agg(distinct variant order by variant) as variants
        from variants
        group by variant_key
        having count(distinct variant) > 1
      )
      select v.url, m.variant_key, m.variants, m.mirror_count
      from variants v
      join mirrored m on m.variant_key = v.variant_key
      order by v.url
    `);

    return result.rows.map((row) => ({
      url: row.url as string,
      detail: {
        variantKey: row.variant_key as string,
        variants: row.variants as string[],
        mirrorCount: Number(row.mirror_count),
      },
    }));
  },
};
