import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `meta.title.template` — Title length is outside the recommended 30–60 chars.
 *
 * Severity: info. Scoped to successfully-fetched (2xx) HTML pages that have a
 * title (`jsonb_array_length(title) >= 1`). Length is measured on the first
 * title (`title->>0`) via `char_length`. Boundaries: `< 30` ⇒ `too-short`,
 * `> 60` ⇒ `too-long` (30 and 60 inclusive are fine).
 *
 * detail: `{ title, length, recommendation }`.
 */
export const metaTitleTemplateRule: Rule = {
  id: 'meta.title.template',
  description: 'Recommend title template (length/keyword guidance)',
  severity: 'info',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select url, title->>0 as val, char_length(title->>0) as len
      from pages
      where audit_id = ${auditId}
        and status_class = '2xx'
        and jsonb_array_length(title) >= 1
        and (char_length(title->>0) < 30 or char_length(title->>0) > 60)
      order by url
    `);
    return res.rows.map((r) => {
      const length = Number(r.len);
      return {
        url: r.url as string,
        detail: {
          title: r.val,
          length,
          recommendation: length < 30 ? 'too-short' : 'too-long',
        },
      };
    });
  },
};
