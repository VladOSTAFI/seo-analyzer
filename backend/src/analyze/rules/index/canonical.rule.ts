import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `index.canonical` — Canonical missing / non-self on a live page.
 *
 * Severity: high.
 *
 * Over fetched 2xx pages, a SQL CASE classifies the canonical problem:
 *  - `canonical_url IS NULL`  → `issue: 'missing'` (no canonical declared);
 *  - `is_self_canonical = false` → `issue: 'non-self'` (canonical points to a
 *    different URL than the page itself).
 * When `is_self_canonical` is true the page is its own canonical (healthy) and
 * the CASE yields NULL, which the outer WHERE filters out so no finding is
 * emitted. `canonical_url` is surfaced in the detail for context.
 */
export const indexCanonicalRule: Rule = {
  id: 'index.canonical',
  description: 'Canonical missing / points off-site / non-self on canonical page',
  severity: 'high',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select url, canonical_url, issue
      from (
        select p.url as url,
               p.canonical_url as canonical_url,
               case
                 when p.canonical_url is null then 'missing'
                 when p.is_self_canonical = false then 'non-self'
                 else null
               end as issue
        from pages p
        where p.audit_id = ${auditId}
          and p.status_class = '2xx'
      ) classified
      where issue is not null
      order by url
    `);

    return result.rows.map(
      (row): Finding => ({
        url: row.url as string,
        detail: {
          issue: row.issue as 'missing' | 'non-self',
          canonicalUrl: (row.canonical_url as string | null) ?? null,
        },
      }),
    );
  },
};
