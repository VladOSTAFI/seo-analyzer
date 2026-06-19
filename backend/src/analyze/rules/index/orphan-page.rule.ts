import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `index.orphan-page` — Live HTML pages with zero internal inlinks.
 *
 * Severity: high. HTML pages only (`page_kind = 'html'`), live only
 * (`status_class = '2xx'`).
 *
 * An orphan receives no internal PageRank, is hard for Google to discover, and
 * rarely ranks. `pages.inlink_count` is computed set-based by
 * `EnrichService.computeInlinkCounts` (internal links whose `href` equals the
 * page `url`), so `inlink_count = 0` after enrich means "no internal inlinks".
 * The crawl seed/entry page (`depth = 0`) is excluded — the homepage is reached
 * directly, not via an inlink, so a zero-inlink seed is not a meaningful orphan.
 *
 * Sitemap-awareness: a page that is ALSO in the sitemap (Google knows about it)
 * is the higher-confidence orphan. That join targets the `sitemap_entries` table
 * introduced by feature 03; until that table exists this rule sets
 * `inSitemap: false` for every row. The rule API is unchanged when the join is
 * later added.
 *
 * Detail: `{ depth, inlinkCount, inSitemap }`.
 */
export const indexOrphanPageRule: Rule = {
  id: 'index.orphan-page',
  description: 'Live HTML pages with no internal inlinks (orphans)',
  severity: 'high',
  async run(db, auditId) {
    // NOTE: `sitemap_entries` (feature 03) does not exist yet, so the optional
    // sitemap LEFT JOIN is omitted and `in_sitemap` is hardcoded false. Once
    // feature 03 lands, re-introduce the LEFT JOIN onto `sitemap_entries`
    // (on `se.audit_id = p.audit_id and se.loc = p.url`) and project
    // `(se.loc is not null) as in_sitemap`.
    const result = await db.execute(sql`
      select
        p.url as url,
        p.depth as depth,
        coalesce(p.inlink_count, 0) as inlink_count,
        false as in_sitemap
      from pages p
      where p.audit_id = ${auditId}
        and p.page_kind = 'html'
        and p.status_class = '2xx'
        and p.depth > 0
        and coalesce(p.inlink_count, 0) = 0
      order by p.url
    `);

    return result.rows.map(
      (row): Finding => ({
        url: row.url as string,
        detail: {
          depth: Number(row.depth),
          inlinkCount: Number(row.inlink_count),
          inSitemap: Boolean(row.in_sitemap),
        },
      }),
    );
  },
};
