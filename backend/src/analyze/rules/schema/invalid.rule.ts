import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `schema.invalid` — a JSON-LD block that could not be parsed at all.
 *
 * Severity: high (a syntax error blocks the entire block from being read by
 * search engines). Confidence: high.
 *
 * SQL mechanism: `structured_data` rows on live HTML pages whose `errors`
 * contain a `json-syntax` code (`type` is null on a parse failure).
 */
export const schemaInvalidRule: Rule = {
  id: 'schema.invalid',
  description: 'Invalid JSON-LD (syntax error blocks parsing)',
  severity: 'high',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select sd.page_url as page_url
      from structured_data sd
      join pages p on p.audit_id = sd.audit_id and p.url = sd.page_url
      where sd.audit_id = ${auditId}
        and p.page_kind = 'html'
        and p.status_class = '2xx'
        and exists (
          select 1 from jsonb_array_elements(sd.errors) e
          where e->>'code' = 'json-syntax'
        )
      order by sd.page_url
    `);
    return res.rows.map(
      (r): Finding => ({
        url: r.page_url as string,
        detail: { issue: 'invalid' },
      }),
    );
  },
};
