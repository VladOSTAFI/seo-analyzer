import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

// Maximum acceptable click depth (BFS distance from the crawl seed). Pages
// buried deeper than this are flagged. Read at rule-build time, same idiom as
// `PERF_LAB_SCORE_MIN` in perf/lab-score.rule.ts. Default 3 (mirrors the
// `SEO_MAX_DEPTH` env default).
const maxDepth = Number(process.env.SEO_MAX_DEPTH) || 3;

/**
 * `index.click-depth` — Live HTML pages buried deeper than the threshold.
 *
 * Severity: medium. HTML pages only (`page_kind = 'html'`), live only
 * (`status_class = '2xx'`).
 *
 * Depth correlates with crawl priority and perceived importance: pages more than
 * `SEO_MAX_DEPTH` (default 3) clicks from the homepage are crawled less often and
 * rank worse — a crawl-budget and information-architecture signal.
 *
 * Caveat: `pages.depth` is BFS distance from the single crawl seed, so it
 * APPROXIMATES click depth from the homepage. Multi-entry sites may show inflated
 * depth; this is a documented known approximation.
 *
 * Detail: `{ depth }`. Threshold injected from `env.SEO_MAX_DEPTH`.
 */
export const indexClickDepthRule: Rule = {
  id: 'index.click-depth',
  description: 'Live HTML pages buried more than SEO_MAX_DEPTH clicks deep',
  severity: 'medium',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select p.url as url, p.depth as depth
      from pages p
      where p.audit_id = ${auditId}
        and p.page_kind = 'html'
        and p.status_class = '2xx'
        and p.depth > ${maxDepth}
      order by p.url
    `);

    return result.rows.map(
      (row): Finding => ({
        url: row.url as string,
        detail: { depth: Number(row.depth) },
      }),
    );
  },
};
