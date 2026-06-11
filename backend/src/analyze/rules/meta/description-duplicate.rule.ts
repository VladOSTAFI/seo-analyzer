import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `meta.description.duplicate` — Same meta description (first value) shared by
 * 2+ pages.
 *
 * Severity: medium. Duplicate descriptions across pages hurt SERP snippet
 * differentiation and signal thin/templated metadata — a real on-page issue
 * that should outrank pure performance *opportunity* flags, so it is graded
 * medium rather than low (severity calibration, ANALYSIS §4 item 7). Scoped to
 * successfully-fetched (2xx) HTML pages (content-type gated) that have at least
 * one description. Inner GROUP BY on `meta_description->>0` HAVING count > 1,
 * joined back to pages so ONE finding is emitted per affected page.
 *
 * detail: `{ description, duplicateCount }`.
 */
export const metaDescriptionDuplicateRule: Rule = {
  id: 'meta.description.duplicate',
  description: 'Duplicate meta description across pages',
  severity: 'medium',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select p.url, p.meta_description->>0 as val, d.cnt
      from pages p
      join (
        select meta_description->>0 as val, count(*) as cnt
        from pages
        where audit_id = ${auditId}
          and status_class = '2xx'
          and (content_type is null or content_type like 'text/html%')
          and jsonb_array_length(meta_description) >= 1
        group by meta_description->>0
        having count(*) > 1
      ) d on (p.meta_description->>0) = d.val
      where p.audit_id = ${auditId}
        and p.status_class = '2xx'
        and (p.content_type is null or p.content_type like 'text/html%')
        and jsonb_array_length(p.meta_description) >= 1
      order by p.url
    `);
    return res.rows.map((r) => ({
      url: r.url as string,
      detail: { description: r.val, duplicateCount: Number(r.cnt) },
    }));
  },
};
