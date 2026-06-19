import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `sitemap.url-not-200` — listed-but-non-200 sitemap URLs (feature 03).
 *
 * Severity: high. Confidence: high.
 *
 * A URL listed in the sitemap should resolve to a live 200. We flag entries that
 * WERE crawled (`in_crawl = true`) but whose joined `status_code` is missing or
 * outside the 2xx band — a confirmed broken/redirecting sitemap entry that wastes
 * crawl budget and sends Google a contradictory signal. URLs listed but NOT
 * crawled (`in_crawl = false`) are a discovery-gap concern owned by the orphan
 * diff (#04), not here, to avoid double-counting. Pure set-based read.
 */
export const sitemapUrlNot200Rule: Rule = {
  id: 'sitemap.url-not-200',
  description: 'Sitemap lists a URL that is not a live 200 response',
  severity: 'high',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select loc, status_code
      from sitemap_entries
      where audit_id = ${auditId}
        and in_crawl = true
        and (status_code is null or status_code < 200 or status_code >= 300)
      order by loc
    `);

    return result.rows.map((row): Finding => ({
      url: row.loc as string,
      detail: {
        statusCode: row.status_code != null ? Number(row.status_code) : null,
      },
    }));
  },
};
