import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

// Master gate for the heuristic soft-404 rule. Allows disabling on multilingual
// sites with high false-positive rates. Same boolean idiom as
// `RULE_EXTERNAL_FLAG_ENABLED` in rule.registry.ts; default ON (mirrors the
// `SEO_SOFT404_ENABLED` env default of true).
const _soft404Raw = (process.env.SEO_SOFT404_ENABLED ?? '').toLowerCase().trim();
const soft404Enabled = _soft404Raw === '' || ['true', '1', 'yes', 'on'].includes(_soft404Raw);

/**
 * `index.soft-404` — A 200 page that is really a "not found" / error page.
 *
 * Severity: medium. Confidence: medium (explicitly heuristic). HTML pages only
 * (`page_kind = 'html'`), live only (`status_class = '2xx'`).
 *
 * Google wastes crawl budget on, and may index, a thin error page that returns
 * 200 instead of 404. This is the VOCABULARY-MATCH phase only: a 2xx HTML page
 * whose `title` or `h1` (first element of the jsonb array) matches a multilingual
 * "not found" vocabulary (EN/RU/UK). The `word_count < SEO_SOFT404_MAX_WORDS`
 * clause is deferred until feature 08 adds the `word_count` column.
 *
 * False-positive risk (legitimately short pages, multilingual error strings) is
 * why confidence is `medium` and the whole rule is suppressible via
 * `SEO_SOFT404_ENABLED=false`.
 *
 * Detail: `{ title, h1 }` (the matched values).
 */
export const indexSoft404Rule: Rule = {
  id: 'index.soft-404',
  description: 'Likely soft-404: a 200 page whose title/h1 matches an error vocabulary',
  severity: 'medium',
  confidence: 'medium',
  async run(db, auditId) {
    if (!soft404Enabled) return [];

    const result = await db.execute(sql`
      select url, title->>0 as title, h1->>0 as h1
      from pages
      where audit_id = ${auditId} and status_class = '2xx' and page_kind = 'html'
        and (coalesce(title->>0, '') ~* '(404|not[ -]?found|page not found|не найден|не знайдено)'
          or coalesce(h1->>0, '')    ~* '(404|not[ -]?found|page not found|не найден|не знайдено)')
      order by url
    `);

    return result.rows.map(
      (row): Finding => ({
        url: row.url as string,
        detail: {
          title: (row.title as string | null) ?? null,
          h1: (row.h1 as string | null) ?? null,
        },
      }),
    );
  },
};
