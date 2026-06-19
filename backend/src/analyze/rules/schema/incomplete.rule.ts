import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/** One error annotation as persisted in structured_data.errors. */
interface SchemaErrorRow {
  code: string;
  prop?: string;
  type?: string;
}

/**
 * `schema.incomplete` — a parsed JSON-LD node missing required and/or
 * recommended properties (e.g. an Organization without `name`, or a Product
 * without `offers`). Recommended-prop gaps are rich-result eligibility gaps.
 *
 * Severity: medium. Confidence: high.
 *
 * SQL mechanism (pattern from i18n.hreflang): select nodes on live HTML pages
 * that have a non-null `type` and at least one `missing-required` /
 * `missing-recommended` error; the missing-prop list is composed in JS from the
 * `errors` jsonb (mirrors the hreflang `issues.join(',')` projection).
 */
export const schemaIncompleteRule: Rule = {
  id: 'schema.incomplete',
  description: 'Structured data missing required / recommended properties',
  severity: 'medium',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select sd.page_url as page_url, sd.type as type, sd.errors as errors
      from structured_data sd
      join pages p on p.audit_id = sd.audit_id and p.url = sd.page_url
      where sd.audit_id = ${auditId}
        and p.page_kind = 'html'
        and p.status_class = '2xx'
        and sd.type is not null
        and jsonb_array_length(sd.errors) > 0
        and exists (
          select 1 from jsonb_array_elements(sd.errors) e
          where e->>'code' in ('missing-required', 'missing-recommended')
        )
      order by sd.page_url, sd.type
    `);

    return res.rows.map((row): Finding => {
      const errors = (row.errors as SchemaErrorRow[] | null) ?? [];
      const missing: string[] = [];
      for (const e of errors) {
        if (
          (e.code === 'missing-required' || e.code === 'missing-recommended') &&
          e.prop &&
          !missing.includes(e.prop)
        ) {
          missing.push(e.prop);
        }
      }
      return {
        url: row.page_url as string,
        detail: {
          type: row.type as string,
          missing,
        },
      };
    });
  },
};
