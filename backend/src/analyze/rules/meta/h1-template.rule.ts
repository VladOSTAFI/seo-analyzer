import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `meta.h1.template` — H1 length is outside the recommended 20–70 chars.
 *
 * Severity: info. Scoped to successfully-fetched (2xx) HTML pages that have an
 * h1. Length is measured on the first h1 (`h1->>0`) via `char_length`.
 * Boundaries: `< 20` ⇒ `too-short`, `> 70` ⇒ `too-long`.
 *
 * detail: `{ h1, length, recommendation }`.
 */
export const metaH1TemplateRule: Rule = {
  id: 'meta.h1.template',
  description: 'Recommend H1 guidance',
  severity: 'info',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select url, h1->>0 as val, char_length(h1->>0) as len
      from pages
      where audit_id = ${auditId}
        and status_class = '2xx'
        and jsonb_array_length(h1) >= 1
        and (char_length(h1->>0) < 20 or char_length(h1->>0) > 70)
      order by url
    `);
    return res.rows.map((r) => {
      const length = Number(r.len);
      return {
        url: r.url as string,
        detail: {
          h1: r.val,
          length,
          recommendation: length < 20 ? 'too-short' : 'too-long',
        },
      };
    });
  },
};
