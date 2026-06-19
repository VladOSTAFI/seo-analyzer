import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `index.signal-conflict` — Contradictory indexation directives on one page.
 *
 * Severity: high. Confidence: high for the SQL-provable sub-checks; `medium`
 * (per-finding override) for the sitemap-proxy variant while it relies on
 * `crawl_source` rather than a true sitemap-URL table.
 *
 * Each directive read alone looks fine, so the per-signal rules (`index.canonical`,
 * `index.robots`) never catch the contradiction. This rule emits ONE finding per
 * `(url, conflict)` over existing `pages` columns (Track A — no crawl changes),
 * with `detail.conflict` naming the sub-check and `detail.target` the offending
 * related URL where applicable.
 *
 * `is_noindex(x)` is the shared fragment
 * `(meta_robots ilike '%noindex%' or x_robots_tag ilike '%noindex%' or blocked_by_robots_txt = true)`
 * (verbatim from `index.robots`). Canonical-target matching resolves against BOTH
 * `t.url` (pre-redirect) and `t.final_url` (post-redirect) and uses a JOIN so
 * canonicals pointing off-crawl produce no false positive (no target row).
 *
 * Sub-checks:
 *   1. `noindex-in-sitemap`    — noindex AND discovered via sitemap (proxy:
 *      `crawl_source = 'sitemap'`; confidence medium). Swap for a sitemap-URL
 *      join once feature 03 lands.
 *   2. `canonical-to-noindex`  — non-self canonical whose target is noindex.
 *   3. `canonical-to-non-200`  — non-self canonical whose target is not 2xx
 *      (covers 3xx/4xx/5xx, incl. a redirecting canonical).
 *   4. `noindex-canonical-target` — a noindex page that is the canonical target
 *      of one or more OTHER pages (emitted on the bad target).
 *   5. `canonical-chain`       — A→B where B is itself non-self-canonical (B→C),
 *      i.e. a chained canonical Google won't reliably follow.
 *
 * Detail: `{ conflict, target }`.
 */
type ConflictType =
  | 'noindex-in-sitemap'
  | 'canonical-to-noindex'
  | 'canonical-to-non-200'
  | 'noindex-canonical-target'
  | 'canonical-chain';

export const indexSignalConflictRule: Rule = {
  id: 'index.signal-conflict',
  description: 'Contradictory indexation signals (noindex/canonical conflicts) on one page',
  severity: 'high',
  async run(db, auditId) {
    const result = await db.execute(sql`
      with hp as (
        select id, url, final_url, canonical_url, is_self_canonical, status_class, crawl_source,
               (meta_robots ilike '%noindex%' or x_robots_tag ilike '%noindex%'
                  or blocked_by_robots_txt = true) as is_noindex
        from pages
        where audit_id = ${auditId} and page_kind = 'html'
      )
      -- 1) noindex AND in sitemap (proxy: crawl_source = 'sitemap')
      select p.url as url, 'noindex-in-sitemap' as conflict, null::text as target
      from hp p
      where p.status_class = '2xx' and p.is_noindex and p.crawl_source = 'sitemap'
      union all
      -- 2) canonical -> noindex target
      select p.url, 'canonical-to-noindex', t.url
      from hp p join hp t on t.url = p.canonical_url or t.final_url = p.canonical_url
      where p.status_class = '2xx' and p.is_self_canonical = false and t.is_noindex
      union all
      -- 3) canonical -> non-200 (incl. 3xx redirecting target)
      select p.url, 'canonical-to-non-200', t.url
      from hp p join hp t on t.url = p.canonical_url or t.final_url = p.canonical_url
      where p.status_class = '2xx' and p.is_self_canonical = false and t.status_class <> '2xx'
      union all
      -- 4) noindex page that is the canonical target of others
      select p.url, 'noindex-canonical-target', src.url
      from hp p
      join hp src on (src.canonical_url = p.url or src.canonical_url = p.final_url)
                 and src.id <> p.id
      where p.status_class = '2xx' and p.is_noindex
      union all
      -- 5) canonical chain A->B->C (B is non-self-canonical -> chain)
      select p.url, 'canonical-chain', t.canonical_url
      from hp p join hp t on t.url = p.canonical_url or t.final_url = p.canonical_url
      where p.status_class = '2xx' and p.is_self_canonical = false
        and t.is_self_canonical = false and t.canonical_url is not null
        -- is-distinct-from so a NULL final_url still counts as a differing target
        and t.canonical_url is distinct from t.url
        and t.canonical_url is distinct from t.final_url
      order by 1, 2
    `);

    return result.rows.map((row): Finding => {
      const conflict = row.conflict as ConflictType;
      return {
        url: row.url as string,
        detail: {
          conflict,
          target: (row.target as string | null) ?? null,
        },
        // The sitemap-proxy variant relies on `crawl_source` (not a true
        // sitemap-URL table yet), so downgrade its confidence to medium.
        ...(conflict === 'noindex-in-sitemap' ? { confidence: 'medium' as const } : {}),
      };
    });
  },
};
