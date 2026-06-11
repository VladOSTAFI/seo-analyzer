import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `meta.description.template` — Description length is outside the recommended
 * 70–160 chars.
 *
 * Severity: info. Scoped to successfully-fetched (2xx) HTML pages (content-type gated) that
 * have a description. Length is measured on the first value (`meta_description->>0`)
 * via `char_length`. Boundaries: `< 70` ⇒ `too-short`, `> 160` ⇒ `too-long`.
 *
 * detail: `{ description, length, recommendation }`.
 */
export const metaDescriptionTemplateRule: Rule = {
  id: 'meta.description.template',
  description: 'Recommend description template',
  severity: 'info',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select url, meta_description->>0 as val, char_length(meta_description->>0) as len
      from pages
      where audit_id = ${auditId}
        and status_class = '2xx'
        and (content_type is null or content_type like 'text/html%')
        and jsonb_array_length(meta_description) >= 1
        and (char_length(meta_description->>0) < 70 or char_length(meta_description->>0) > 160)
      order by url
    `);
    return res.rows.map((r) => {
      const length = Number(r.len);
      return {
        url: r.url as string,
        detail: {
          description: r.val,
          length,
          recommendation: length < 70 ? 'too-short' : 'too-long',
        },
      };
    });
  },
};
