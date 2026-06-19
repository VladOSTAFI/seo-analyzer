import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `sitemap.noindex-url` — listed-but-blocked-from-indexing URLs (feature 03).
 *
 * Severity: high. Confidence: high.
 *
 * Listing a `noindex` URL — or one that canonicalizes elsewhere — in the sitemap
 * is a mixed signal: the sitemap says "index this", the page says "don't". We
 * flag crawled (`in_crawl = true`) entries where `is_noindex = true` OR
 * `is_self_canonical = false`, folding both under one ruleId with a `reason`
 * detail (`noindex` | `non-self-canonical` | both). Pure set-based read.
 */
export const sitemapNoindexUrlRule: Rule = {
  id: 'sitemap.noindex-url',
  description: 'Sitemap lists a URL that is noindex or canonicalizes elsewhere',
  severity: 'high',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select loc, status_code, is_noindex, is_self_canonical
      from sitemap_entries
      where audit_id = ${auditId}
        and in_crawl = true
        and (is_noindex = true or is_self_canonical = false)
      order by loc
    `);

    return result.rows.map((row): Finding => {
      const reason: string[] = [];
      if (row.is_noindex === true) reason.push('noindex');
      if (row.is_self_canonical === false) reason.push('non-self-canonical');
      return {
        url: row.loc as string,
        detail: {
          reason,
          statusCode: row.status_code != null ? Number(row.status_code) : null,
        },
      };
    });
  },
};
