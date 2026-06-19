import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `pagination.rel` — Broken/missing `rel=next/prev` reciprocity on paginated series.
 *
 * Severity: medium. HTML pages only (content-type gated).
 *
 * SQL mechanism: scope to HTML pages that are part of a pagination series (i.e.
 * `rel_next IS NOT NULL OR rel_prev IS NOT NULL`) and are themselves on 2xx.
 * For each such page `p` with a non-null `rel_next`, LEFT JOIN the crawled page
 * `nxt` at `nxt.url = p.rel_next`. We flag the page when its forward link is
 * broken:
 *   - `next-target-missing`    — no crawled 2xx page exists at `rel_next`, or
 *   - `next-not-reciprocal`    — that target exists (2xx) but its `rel_prev`
 *                                does not point back to `p.url`.
 *
 * SCOPE NOTE: we intentionally check only `rel_next` reciprocity (forward
 * direction) to keep this tractable; the symmetric `rel_prev` check is a
 * deliberate deferred enhancement. A series with N pages still surfaces every
 * broken forward hop, which is sufficient to detect a torn chain.
 */
export const paginationRelRule: Rule = {
  id: 'pagination.rel',
  description: 'Broken/missing `rel=next/prev` on paginated series',
  severity: 'medium',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select
        p.url            as url,
        p.rel_next       as rel_next,
        (nxt.url is null) as target_missing
      from pages p
      left join pages nxt
        on nxt.audit_id = p.audit_id
        and nxt.url = p.rel_next
        and nxt.status_class = '2xx'
      where p.audit_id = ${auditId}
        and p.status_class = '2xx'
        and (p.content_type is null or p.content_type like 'text/html%')
        and (p.rel_next is not null or p.rel_prev is not null)
        and p.rel_next is not null
        and (
          nxt.url is null
          or nxt.rel_prev is distinct from p.url
        )
    `);
    return result.rows.map((row): Finding => {
      const targetMissing = row.target_missing === true;
      return {
        url: row.url as string,
        detail: {
          relNext: row.rel_next as string,
          issue: targetMissing ? 'next-target-missing' : 'next-not-reciprocal',
        },
      };
    });
  },
};
