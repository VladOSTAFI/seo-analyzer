import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `dupe.content` — Duplicate pages by content hash.
 *
 * Severity: high. HTML pages only (content-type gated).
 *
 * SQL mechanism: an inner aggregate over fetched 2xx HTML pages with a non-null
 * `content_hash` (`GROUP BY content_hash HAVING count(*) > 1`) identifies the
 * shared hashes; joining that back to the page rows emits ONE finding per page
 * that participates in a duplicate group. `duplicateCount` is the size of the
 * group the page belongs to. Hashes that are NULL (no body captured) never
 * group, so they are excluded up front.
 */
export const dupeContentRule: Rule = {
  id: 'dupe.content',
  description: 'Duplicate pages by content hash',
  severity: 'high',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select p.url as url,
             p.content_hash as content_hash,
             g.dup_count as dup_count
      from pages p
      join (
        select content_hash, count(*)::int as dup_count
        from pages
        where audit_id = ${auditId}
          and status_class = '2xx'
          and (content_type is null or content_type like 'text/html%')
          and content_hash is not null
        group by content_hash
        having count(*) > 1
      ) g on g.content_hash = p.content_hash
      where p.audit_id = ${auditId}
        and p.status_class = '2xx'
        and (p.content_type is null or p.content_type like 'text/html%')
        and p.content_hash is not null
      order by p.url
    `);

    return result.rows.map(
      (row): Finding => ({
        url: row.url as string,
        detail: {
          contentHash: row.content_hash as string,
          duplicateCount: Number(row.dup_count),
        },
      }),
    );
  },
};
