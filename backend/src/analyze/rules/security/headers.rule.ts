import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

type ReasonCode = 'missing-nosniff' | 'missing-csp';

/**
 * `security.headers` — Missing baseline security headers (feature 11).
 *
 * Severity: low. Confidence: medium (some headers are set at the edge/CDN and
 * may differ from origin — reported as-observed). HTML pages only.
 *
 * Flags HTML pages lacking `X-Content-Type-Options: nosniff` and/or a
 * Content-Security-Policy. The boolean reasons are selected in SQL; the
 * `reason[]` is composed JS-side (mirrors `index.robots`).
 *
 * detail: `{ reason[], xContentTypeOptions, cspPresent }`.
 */
export const securityHeadersRule: Rule = {
  id: 'security.headers',
  description: 'Missing X-Content-Type-Options: nosniff and/or Content-Security-Policy',
  severity: 'low',
  confidence: 'medium',
  async run(db, auditId): Promise<Finding[]> {
    const res = await db.execute(sql`
      select url,
             x_content_type_options,
             csp_present,
             (x_content_type_options is null or lower(x_content_type_options) <> 'nosniff') as missing_nosniff,
             (csp_present = false) as missing_csp
      from pages
      where audit_id = ${auditId}
        and page_kind = 'html'
        and (
          x_content_type_options is null
          or lower(x_content_type_options) <> 'nosniff'
          or csp_present = false
        )
      order by url
    `);

    return res.rows.map((row): Finding => {
      const reason: ReasonCode[] = [];
      if (row.missing_nosniff) reason.push('missing-nosniff');
      if (row.missing_csp) reason.push('missing-csp');
      return {
        url: row.url as string,
        detail: {
          reason,
          xContentTypeOptions: (row.x_content_type_options as string | null) ?? null,
          cspPresent: Boolean(row.csp_present),
        },
      };
    });
  },
};
