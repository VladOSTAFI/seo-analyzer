import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `meta.title.duplicate` — Same title (first `<title>`) shared by 2+ pages.
 *
 * Severity: medium. Scoped to successfully-fetched (2xx) HTML pages (content-type gated) that
 * have at least one title. An inner GROUP BY on `title->>0` HAVING count > 1 finds the
 * shared titles; we join back to pages so ONE finding is emitted per affected
 * page (not one per duplicate group).
 *
 * detail: `{ title, duplicateCount }`.
 */
export const metaTitleDuplicateRule: Rule = {
  id: 'meta.title.duplicate',
  description: 'Same title across multiple pages',
  severity: 'medium',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select p.url, p.title->>0 as val, d.cnt
      from pages p
      join (
        select title->>0 as val, count(*) as cnt
        from pages
        where audit_id = ${auditId}
          and status_class = '2xx'
          and (content_type is null or content_type like 'text/html%')
          and jsonb_array_length(title) >= 1
        group by title->>0
        having count(*) > 1
      ) d on (p.title->>0) = d.val
      where p.audit_id = ${auditId}
        and p.status_class = '2xx'
        and (p.content_type is null or p.content_type like 'text/html%')
        and jsonb_array_length(p.title) >= 1
      order by p.url
    `);
    return res.rows.map((r) => ({
      url: r.url as string,
      detail: { title: r.val, duplicateCount: Number(r.cnt) },
    }));
  },
};
