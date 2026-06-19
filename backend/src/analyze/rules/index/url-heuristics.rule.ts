import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `index.url-heuristics` — Non-SEO-friendly URLs (ЧПУ).
 *
 * Severity: low. HTML pages only (content-type gated).
 *
 * Over fetched 2xx HTML pages we compute four independent heuristics in SQL and
 * assemble the tripped ones into `issues` in JS:
 *  - `uppercase`     — an uppercase letter in the path/query (NOT the scheme or
 *                      host, whose casing is not author-controlled / not an SEO
 *                      signal). The host is stripped with
 *                      `regexp_replace(url, '^https?://[^/]+', '')` and the
 *                      remainder tested for `[A-Z]`.
 *  - `underscore`    — an `_` in the path/query (hyphens are the SEO-preferred
 *                      word separator). Tested on the same host-stripped path so
 *                      an underscore in a hostname is ignored.
 *  - `query-params`  — the URL carries a `?` query string.
 *  - `too-long`      — `char_length(url) > 115`. 115 is a pragmatic readability
 *                      threshold (well under the ~2048 hard limit); long URLs
 *                      hurt shareability and are a common ЧПУ smell.
 *
 * A finding is emitted only when at least one heuristic trips.
 */
type HeuristicIssue = 'uppercase' | 'underscore' | 'query-params' | 'too-long';

export const indexUrlHeuristicsRule: Rule = {
  id: 'index.url-heuristics',
  description: 'Non-SEO-friendly URLs (ЧПУ): uppercase, params, underscores, length',
  severity: 'low',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select url, has_uppercase, has_underscore, has_query, too_long
      from (
        select p.url as url,
               (regexp_replace(p.url, '^https?://[^/]+', '') ~ '[A-Z]') as has_uppercase,
               (regexp_replace(p.url, '^https?://[^/]+', '') like '%\\_%') as has_underscore,
               (p.url like '%?%') as has_query,
               (char_length(p.url) > 115) as too_long
        from pages p
        where p.audit_id = ${auditId}
          and p.status_class = '2xx'
          and (p.content_type is null or p.content_type like 'text/html%')
      ) h
      where has_uppercase or has_underscore or has_query or too_long
      order by url
    `);

    return result.rows.map((row): Finding => {
      const issues: HeuristicIssue[] = [];
      if (row.has_uppercase) issues.push('uppercase');
      if (row.has_underscore) issues.push('underscore');
      if (row.has_query) issues.push('query-params');
      if (row.too_long) issues.push('too-long');

      return {
        url: row.url as string,
        detail: { issues },
      };
    });
  },
};
